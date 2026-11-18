import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { captureLogs } from '../test/helpers.js';
import {
  fakeSmsProvider,
  memoryNotificationStore,
  permanentFailure,
  retryableFailure,
  testTemplates,
  type FakeOutcome,
} from '../test/notifications.js';
import { processNotificationQueue } from './queue.js';
import { MAX_SEND_ATTEMPTS } from './retryPolicy.js';
import { sendNotification } from './send.js';
import { linkTemplate } from './templates.js';

const phone = '+2348031234567';
const greeting = { template: 'greeting', params: { name: 'Ade' }, to: phone } as const;
const nothingDone = { queued: 0, sent: 0, failed: 0 };

function setup(...outcomes: FakeOutcome[]) {
  const table = memoryNotificationStore();
  const sms = fakeSmsProvider(...outcomes);
  const logs = captureLogs();
  const deps = {
    store: table.store,
    sms: sms.provider,
    logger: logs.logger,
    templates: testTemplates,
  };
  return { deps, table, sms, logs };
}

describe('processNotificationQueue', () => {
  it('sends a message that failed inline on the next run', async () => {
    const { deps, table, sms } = setup(retryableFailure(), 'ok');
    const { id } = await sendNotification(deps, greeting);

    await expect(processNotificationQueue(deps)).resolves.toEqual({ ...nothingDone, sent: 1 });
    expect(sms.sent.map((message) => message.text)).toEqual([
      'Hello Ade, this is ColdLink.',
      'Hello Ade, this is ColdLink.',
    ]);
    expect(table.row(id)).toMatchObject({
      status: 'sent',
      attempts: 2,
      providerMessageId: 'fake-2',
    });
  });

  it(`gives up with an alert after ${MAX_SEND_ATTEMPTS} attempts`, async () => {
    const failures = Array.from({ length: MAX_SEND_ATTEMPTS }, retryableFailure);
    const { deps, table, sms, logs } = setup(...failures);
    const { id } = await sendNotification(deps, greeting);

    for (let attempt = 2; attempt < MAX_SEND_ATTEMPTS; attempt += 1) {
      await expect(processNotificationQueue(deps)).resolves.toEqual({ ...nothingDone, queued: 1 });
    }
    expect(logs.output()).not.toContain('SMS delivery failed');
    await expect(processNotificationQueue(deps)).resolves.toEqual({ ...nothingDone, failed: 1 });

    expect(sms.sent).toHaveLength(MAX_SEND_ATTEMPTS);
    expect(table.row(id)).toMatchObject({ status: 'failed', attempts: MAX_SEND_ATTEMPTS });
    expect(logs.output()).toContain('"msg":"SMS delivery failed"');
    await expect(processNotificationQueue(deps)).resolves.toEqual(nothingDone);
    expect(sms.sent).toHaveLength(MAX_SEND_ATTEMPTS);
  });

  it('stops retrying on a non-retryable failure', async () => {
    const { deps, table, sms } = setup(retryableFailure(), permanentFailure());
    const { id } = await sendNotification(deps, greeting);

    await expect(processNotificationQueue(deps)).resolves.toEqual({ ...nothingDone, failed: 1 });
    expect(table.row(id)).toMatchObject({ status: 'failed', attempts: 2 });
    expect(sms.sent).toHaveLength(2);
  });

  it('never resends an OTP left queued, and marks it failed', async () => {
    const { deps, table, sms, logs } = setup();
    const id = await table.store.insert({
      userId: null,
      recipientPhone: phone,
      template: 'otp',
      payload: { expires_in_minutes: 10 },
    });

    await expect(processNotificationQueue(deps)).resolves.toEqual({ ...nothingDone, failed: 1 });
    expect(sms.sent).toEqual([]);
    expect(table.row(id)).toMatchObject({
      status: 'failed',
      error: 'Not retryable: the message was never stored',
    });
    expect(logs.output()).toContain('SMS delivery failed');
  });

  it.each([
    ['an unknown template', 'retired_template', { name: 'Ade' }, 'Unknown template'],
    [
      'a payload the template rejects',
      'greeting',
      { nom: 'Ade' },
      'The stored payload no longer fits the template',
    ],
  ])('fails a message with %s without sending it', async (_case, template, payload, error) => {
    const { deps, table, sms } = setup();
    const id = await table.store.insert({ userId: null, recipientPhone: phone, template, payload });

    await expect(processNotificationQueue(deps)).resolves.toEqual({ ...nothingDone, failed: 1 });
    expect(sms.sent).toEqual([]);
    expect(table.row(id)).toMatchObject({ status: 'failed', error });
  });

  it('takes at most the batch limit', async () => {
    const { deps, sms } = setup();
    for (const name of ['A', 'B', 'C']) {
      await deps.store.insert({
        userId: null,
        recipientPhone: phone,
        template: 'greeting',
        payload: { name },
      });
    }
    await expect(processNotificationQueue(deps, 2)).resolves.toEqual({ ...nothingDone, sent: 2 });
    expect(sms.sent).toHaveLength(2);
  });

  describe('a message with a link', () => {
    function linkSetup(relinked: string | undefined) {
      const { deps, table, sms } = setup(retryableFailure());
      const templates = {
        ...deps.templates,
        invite: linkTemplate({
          stored: z.object({ name: z.string() }),
          render: ({ name, link }) => `Hello ${name}: ${link}`,
          relink: () => Promise.resolve(relinked),
        }),
      };
      return { deps: { ...deps, templates }, table, sms };
    }
    const invite = {
      template: 'invite',
      params: { name: 'Ade', link: 'https://app.coldlink.test/a/first' },
      to: phone,
    } as const;

    it('is resent with a fresh link, never the stored one', async () => {
      const { deps, table, sms } = linkSetup('https://app.coldlink.test/a/second');
      const { id } = await sendNotification(deps, invite);

      await expect(processNotificationQueue(deps)).resolves.toEqual({ ...nothingDone, sent: 1 });
      expect(sms.sent.map((message) => message.text)).toEqual([
        'Hello Ade: https://app.coldlink.test/a/first',
        'Hello Ade: https://app.coldlink.test/a/second',
      ]);
      expect(table.row(id).payload).toEqual({ name: 'Ade' });
    });

    it('fails without sending when no fresh link is given', async () => {
      const { deps, table, sms } = linkSetup(undefined);
      const { id } = await sendNotification(deps, invite);

      await expect(processNotificationQueue(deps)).resolves.toEqual({ ...nothingDone, failed: 1 });
      expect(sms.sent).toHaveLength(1);
      expect(table.row(id)).toMatchObject({
        status: 'failed',
        error: 'The message no longer applies',
      });
    });
  });
});
