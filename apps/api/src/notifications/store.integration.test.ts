import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import type { JsonObject } from '../db/schema.js';
import { captureLogs } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import {
  fakeSmsProvider,
  permanentFailure,
  retryableFailure,
  testTemplates,
  type FakeOutcome,
} from '../test/notifications.js';
import { requireTestDatabaseUrl } from '../test/testDatabase.js';
import { processNotificationQueue } from './queue.js';
import { sendNotification } from './send.js';
import { createNotificationStore } from './store.js';

const phone = '+2348031234567';
const code = '482913';
const greeting = { template: 'greeting', params: { name: 'Ade' }, to: phone } as const;

interface QueuedRow {
  attempts?: number;
  /** Seconds since the last attempt. */
  idleSeconds?: number;
  createdSecondsAgo?: number;
  template?: string;
  payload?: JsonObject;
}

async function insertQueued(
  db: Database,
  {
    attempts = 0,
    idleSeconds = 3600,
    createdSecondsAgo = 3600,
    template = 'greeting',
    payload = { name: 'Ade' },
  }: QueuedRow = {},
): Promise<string> {
  const { id } = await db
    .insertInto('notifications')
    .values({
      recipient_phone: phone,
      channel: 'sms',
      template,
      payload: JSON.stringify(payload),
      attempts,
      created_at: sql<Date>`now() - make_interval(secs => ${createdSecondsAgo})`,
      updated_at: sql<Date>`now() - make_interval(secs => ${idleSeconds})`,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return id;
}

function notifier(db: Database, ...outcomes: FakeOutcome[]) {
  const sms = fakeSmsProvider(...outcomes);
  const deps = {
    store: createNotificationStore(db),
    sms: sms.provider,
    logger: captureLogs().logger,
    templates: testTemplates,
  };
  return { deps, sms };
}

describe.skipIf(noTestDatabase)('notifications against Postgres', () => {
  const db = useTestTransaction();

  function row(id: string) {
    return db()
      .selectFrom('notifications')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  }

  it('logs a sent SMS with its provider message ID and time', async () => {
    const { deps } = notifier(db(), 'ok');
    const { id, status } = await sendNotification(deps, greeting);

    expect(status).toBe('sent');
    const stored = await row(id);
    expect(stored.sent_at).toBeInstanceOf(Date);
    expect(stored).toMatchObject({
      user_id: null,
      recipient_phone: phone,
      channel: 'sms',
      template: 'greeting',
      payload: { name: 'Ade' },
      status: 'sent',
      attempts: 1,
      provider_message_id: 'fake-1',
      error: null,
    });
  });

  it('keeps a retryable failure queued with its error', async () => {
    const { deps } = notifier(db(), retryableFailure());
    const { id } = await sendNotification(deps, greeting);

    expect(await row(id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      error: 'Termii returned HTTP 503',
      provider_message_id: null,
      sent_at: null,
    });
  });

  it('marks a non-retryable failure failed', async () => {
    const { deps } = notifier(db(), permanentFailure());
    const { id } = await sendNotification(deps, greeting);

    expect(await row(id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: 'Termii returned HTTP 401',
      sent_at: null,
    });
  });

  it('never stores an OTP code', async () => {
    const { deps } = notifier(db(), 'ok');
    const { id } = await sendNotification(deps, {
      template: 'otp',
      params: { code, expires_in_minutes: 10 },
      to: phone,
    });

    const stored = await row(id);
    expect(stored.payload).toEqual({ expires_in_minutes: 10 });
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('refuses to change a notification that is no longer queued', async () => {
    const { deps } = notifier(db(), 'ok');
    const { id } = await sendNotification(deps, greeting);
    await expect(deps.store.markFailed(id, 'late')).rejects.toThrow('is not queued');
  });

  it('sends a queued message again on a later run', async () => {
    const id = await insertQueued(db(), { attempts: 1, idleSeconds: 120 });
    const { deps, sms } = notifier(db(), 'ok');

    await expect(processNotificationQueue(deps)).resolves.toEqual({
      queued: 0,
      sent: 1,
      failed: 0,
    });
    expect(sms.sent).toHaveLength(1);
    expect(await row(id)).toMatchObject({ status: 'sent', attempts: 2 });
  });

  describe('claimDue', () => {
    it('takes only messages whose retry delay has passed, oldest first', async () => {
      const due = [
        await insertQueued(db(), { attempts: 2, idleSeconds: 301, createdSecondsAgo: 100 }),
        await insertQueued(db(), { attempts: 0, idleSeconds: 61, createdSecondsAgo: 300 }),
        await insertQueued(db(), { attempts: 3, idleSeconds: 901, createdSecondsAgo: 200 }),
      ];
      await insertQueued(db(), { attempts: 0, idleSeconds: 30 });
      await insertQueued(db(), { attempts: 1, idleSeconds: 59 });
      await insertQueued(db(), { attempts: 2, idleSeconds: 299 });
      await insertQueued(db(), { attempts: 3, idleSeconds: 899 });
      await insertQueued(db(), { attempts: 4 });
      const failed = await insertQueued(db());
      await db()
        .updateTable('notifications')
        .set({ status: 'failed' })
        .where('id', '=', failed)
        .execute();

      const claimed = await createNotificationStore(db()).claimDue(10);
      expect(claimed.map((notification) => notification.id)).toEqual([due[1], due[2], due[0]]);
      expect(claimed[0]).toEqual({
        id: due[1],
        recipientPhone: phone,
        template: 'greeting',
        payload: { name: 'Ade' },
        attempts: 0,
      });
    });

    it('holds what it claims out of the next claim', async () => {
      await insertQueued(db());
      const store = createNotificationStore(db());
      expect(await store.claimDue(10)).toHaveLength(1);
      expect(await store.claimDue(10)).toEqual([]);
    });

    it('takes at most the limit', async () => {
      for (let i = 0; i < 3; i += 1) await insertQueued(db());
      expect(await createNotificationStore(db()).claimDue(2)).toHaveLength(2);
    });
  });
});

// The only integration tests that commit: a row lock and two workers on separate connections can
// only see rows another transaction has committed. They delete their rows afterwards.
describe.skipIf(noTestDatabase)('notification queue across connections', () => {
  let pool: Database | undefined;

  function database(): Database {
    if (pool === undefined) throw new Error('No pool');
    return pool;
  }

  beforeAll(() => {
    pool = createDatabase(
      { databaseUrl: requireTestDatabaseUrl(), databaseSslRootCert: undefined },
      captureLogs().logger,
    );
  });
  afterAll(async () => {
    await pool?.destroy();
  });

  async function withCommittedRow(test: (id: string) => Promise<void>): Promise<void> {
    const id = await insertQueued(database());
    try {
      await test(id);
    } finally {
      await database().deleteFrom('notifications').where('id', '=', id).execute();
    }
  }

  it('skips a row another worker has locked instead of waiting for it', async () => {
    await withCommittedRow(async (id) => {
      const locker = await database().startTransaction().execute();
      try {
        await locker
          .selectFrom('notifications')
          .select('id')
          .where('id', '=', id)
          .forUpdate()
          .execute();
        expect(await createNotificationStore(database()).claimDue(10)).toEqual([]);
      } finally {
        await locker.rollback().execute();
      }
      const claimed = await createNotificationStore(database()).claimDue(10);
      expect(claimed.map((notification) => notification.id)).toEqual([id]);
    });
  });

  it('sends a message once when two workers run at the same time', async () => {
    await withCommittedRow(async (id) => {
      const first = notifier(database(), 'ok');
      const second = notifier(database(), 'ok');
      await Promise.all([
        processNotificationQueue(first.deps),
        processNotificationQueue(second.deps),
      ]);

      expect(first.sms.sent.length + second.sms.sent.length).toBe(1);
      const stored = await database()
        .selectFrom('notifications')
        .select(['status', 'attempts'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(stored).toEqual({ status: 'sent', attempts: 1 });
    });
  });
});
