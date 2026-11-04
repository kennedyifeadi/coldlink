import { randomUUID } from 'node:crypto';
import type { NotificationStatus } from '@coldlink/shared';
import * as z from 'zod';
import type { JsonObject } from '../db/schema.js';
import { MAX_SEND_ATTEMPTS } from '../notifications/retryPolicy.js';
import type { NotificationStore } from '../notifications/store.js';
import { retryableTemplate, smsTemplates } from '../notifications/templates.js';
import { SmsSendError, type SmsMessage, type SmsProvider } from '../sms/provider.js';

/** The real templates plus a retryable one, since only `otp` exists so far. */
export const testTemplates = {
  ...smsTemplates,
  greeting: retryableTemplate({
    params: z.object({ name: z.string() }),
    render: ({ name }) => `Hello ${name}, this is ColdLink.`,
  }),
};

export interface StoredNotification {
  id: string;
  userId: string | null;
  recipientPhone: string;
  template: string;
  payload: JsonObject;
  status: NotificationStatus;
  attempts: number;
  providerMessageId: string | null;
  error: string | null;
}

/** An in-memory `notifications` table. It ignores retry delays: every queued row is due. */
export function memoryNotificationStore() {
  const rows = new Map<string, StoredNotification>();

  function mark(id: string, changes: Partial<StoredNotification>): Promise<void> {
    const row = rows.get(id);
    if (row?.status !== 'queued') throw new Error(`Notification ${id} is not queued`);
    rows.set(id, { ...row, ...changes, attempts: row.attempts + 1 });
    return Promise.resolve();
  }

  const store: NotificationStore = {
    insert(notification) {
      const id = randomUUID();
      rows.set(id, {
        ...notification,
        id,
        status: 'queued',
        attempts: 0,
        providerMessageId: null,
        error: null,
      });
      return Promise.resolve(id);
    },
    markSent: (id, providerMessageId) => mark(id, { status: 'sent', providerMessageId }),
    markRetry: (id, error) => mark(id, { status: 'queued', error }),
    markFailed: (id, error) => mark(id, { status: 'failed', error }),
    claimDue(limit) {
      return Promise.resolve(
        [...rows.values()]
          .filter((row) => row.status === 'queued' && row.attempts < MAX_SEND_ATTEMPTS)
          .slice(0, limit)
          .map(({ id, recipientPhone, template, payload, attempts }) => ({
            id,
            recipientPhone,
            template,
            payload,
            attempts,
          })),
      );
    },
  };

  return {
    store,
    row(id: string): StoredNotification {
      const row = rows.get(id);
      if (row === undefined) throw new Error(`No notification ${id}`);
      return row;
    },
    rows: () => [...rows.values()],
  };
}

export type FakeOutcome = 'ok' | Error;

export const retryableFailure = () => new SmsSendError('Termii returned HTTP 503', true);
export const permanentFailure = () => new SmsSendError('Termii returned HTTP 401', false);

/** Answers each send with the next outcome, then succeeds. */
export function fakeSmsProvider(...outcomes: FakeOutcome[]) {
  const sent: SmsMessage[] = [];
  const provider: SmsProvider = {
    send(message) {
      sent.push(message);
      const outcome = outcomes.shift() ?? 'ok';
      return outcome === 'ok'
        ? Promise.resolve({ providerMessageId: `fake-${sent.length}` })
        : Promise.reject(outcome);
    },
  };
  return { provider, sent };
}
