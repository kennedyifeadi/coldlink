import { describe, expect, it } from 'vitest';
import { captureLogs } from '../test/helpers.js';
import {
  fakeSmsProvider,
  memoryNotificationStore,
  permanentFailure,
  retryableFailure,
  testTemplates,
  type FakeOutcome,
} from '../test/notifications.js';
import { sendNotification } from './send.js';

const phone = '+2348031234567';
const code = '482913';

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

const otp = { template: 'otp', params: { code, expires_in_minutes: 10 }, to: phone } as const;
const greeting = { template: 'greeting', params: { name: 'Ade' }, to: phone } as const;

describe('sendNotification', () => {
  it('logs the SMS, sends it and marks it sent', async () => {
    const { deps, table, sms } = setup('ok');
    const userId = '6f1c1c55-5c55-4c55-8c55-5c555c555c55';
    const result = await sendNotification(deps, { ...greeting, userId });

    expect(result.status).toBe('sent');
    expect(sms.sent).toEqual([
      { to: phone, text: 'Hello Ade, this is ColdLink.', template: 'greeting' },
    ]);
    expect(table.row(result.id)).toMatchObject({
      userId,
      recipientPhone: phone,
      template: 'greeting',
      payload: { name: 'Ade' },
      status: 'sent',
      attempts: 1,
      providerMessageId: 'fake-1',
      error: null,
    });
  });

  it('keeps a retryable failure queued, with the error and a warning', async () => {
    const { deps, table, logs } = setup(retryableFailure());
    const result = await sendNotification(deps, greeting);

    expect(result.status).toBe('queued');
    expect(table.row(result.id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      error: 'Termii returned HTTP 503',
    });
    expect(logs.output()).toContain('SMS send failed, queued for a retry');
    expect(logs.output()).not.toContain('SMS delivery failed');
  });

  it('marks a non-retryable failure failed and raises an alert', async () => {
    const { deps, table, logs } = setup(permanentFailure());
    const result = await sendNotification(deps, greeting);

    expect(result.status).toBe('failed');
    expect(table.row(result.id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: 'Termii returned HTTP 401',
    });
    const alert = logs.lines.map((line) => JSON.parse(line) as Record<string, unknown>).at(-1);
    expect(alert).toMatchObject({
      level: 50,
      msg: 'SMS delivery failed',
      notificationId: result.id,
      template: 'greeting',
      recipient: '[Redacted phone]',
    });
  });

  it.each<[string, FakeOutcome]>([
    ['a retryable failure', retryableFailure()],
    ['a non-retryable failure', permanentFailure()],
    ['an unexpected error', new Error(`socket hang up sending "${code}" to ${phone}`)],
  ])('never throws to the caller for %s', async (_case, failure) => {
    const { deps } = setup(failure);
    const { status } = await sendNotification(deps, greeting);
    expect(['queued', 'failed']).toContain(status);
  });

  it('records an unexpected provider error without its message', async () => {
    const { deps, table } = setup(new Error(`socket hang up sending "${code}" to ${phone}`));
    const { id } = await sendNotification(deps, greeting);
    expect(table.row(id)).toMatchObject({
      status: 'failed',
      error: 'The SMS provider failed unexpectedly',
    });
  });

  describe('otp', () => {
    it('stores the expiry but never the code', async () => {
      const { deps, table, sms } = setup('ok');
      const { id } = await sendNotification(deps, otp);

      expect(sms.sent[0]?.text).toContain(code);
      expect(table.row(id).payload).toEqual({ expires_in_minutes: 10 });
      expect(JSON.stringify(table.rows())).not.toContain(code);
    });

    it('is marked failed at once on a retryable failure, since it cannot be retried', async () => {
      const { deps, table, logs } = setup(retryableFailure());
      const { id, status } = await sendNotification(deps, otp);

      expect(status).toBe('failed');
      expect(table.row(id)).toMatchObject({ status: 'failed', attempts: 1 });
      expect(logs.output()).toContain('SMS delivery failed');
    });

    it.each<[string, FakeOutcome]>([
      ['success', 'ok'],
      ['a retryable failure', retryableFailure()],
      ['a non-retryable failure', permanentFailure()],
      ['an error quoting the text and number', new Error(`failed: "${code}" to ${phone}`)],
    ])('keeps the code and the full number out of the logs on %s', async (_case, outcome) => {
      const { deps, logs } = setup(outcome);
      await sendNotification(deps, otp);

      const text = logs.output();
      expect(text).not.toContain(code);
      expect(text).not.toContain('8031234567');
    });
  });

  describe('caller mistakes', () => {
    it('throws on an unknown template', async () => {
      const { deps, table } = setup();
      await expect(
        sendNotification(deps, { ...greeting, template: 'nope' as 'greeting' }),
      ).rejects.toThrow('Unknown SMS template: nope');
      expect(table.rows()).toEqual([]);
    });

    it('throws on invalid params, before logging or sending anything', async () => {
      const { deps, table, sms } = setup();
      await expect(
        sendNotification(deps, { ...otp, params: { code: '12', expires_in_minutes: 10 } }),
      ).rejects.toThrow('Must be 6 digits');
      expect(table.rows()).toEqual([]);
      expect(sms.sent).toEqual([]);
    });

    it.each(['08031234567', '2348031234567', '+23480312345'])(
      'throws on the recipient %s without echoing it',
      async (to) => {
        const { deps } = setup();
        await expect(sendNotification(deps, { ...greeting, to })).rejects.toThrow(
          'The recipient must be +234 and ten digits',
        );
      },
    );
  });
});
