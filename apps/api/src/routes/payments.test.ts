import { errorResponseSchema, type UserRole } from '@coldlink/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import { createBackgroundTasks } from '../backgroundTasks.js';
import { appConfigRows } from '../test/auth.js';
import { captureLogs, stubDatabase, testConfig } from '../test/helpers.js';
import { chargeSuccessEvent, fakePaymentGateway, signWebhook } from '../test/payments.js';
import { apiRoutes } from './index.js';

// Everything here is decided before a payment or booking is read, or finds none, so a stub
// database is enough; the payment flow is covered against Postgres in payments.integration.test.ts.

const tokens = createAccessTokens(testConfig.auth.jwtSecret);
const userId = '6f2c1a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

function user(roles: UserRole[]) {
  return {
    id: userId,
    phone: '+2348031234567',
    coldlink_id: '4820193',
    full_name: null,
    roles,
    preferred_channel: 'web',
    home_lga: null,
    home_lat: null,
    home_lng: null,
    consented_at: new Date('2026-11-01T09:00:00Z'),
    last_login_at: new Date('2026-11-06T09:00:00Z'),
    is_active: true,
    created_at: new Date('2026-11-01T09:00:00Z'),
  };
}

function app(roles: UserRole[] = ['farmer']) {
  const logs = captureLogs();
  const db = stubDatabase({ users: [user(roles)], app_config: appConfigRows() });
  const payments = fakePaymentGateway();
  const routes = apiRoutes({
    db,
    config: testConfig,
    logger: logs.logger,
    paymentGateway: payments.gateway,
    tasks: createBackgroundTasks(),
  });
  return { app: createApp(testConfig, { db, logger: logs.logger, routes }), logs, payments };
}

function bearer(roles: UserRole[]) {
  return tokens.sign({ sub: userId, cid: '4820193', roles }).then((token) => `Bearer ${token}`);
}

function postWebhook(target: ReturnType<typeof app>, body: string, signature?: string) {
  const call = request(target.app)
    .post('/api/v1/webhooks/paystack')
    .set('Content-Type', 'application/json');
  if (signature !== undefined) call.set('x-paystack-signature', signature);
  return call.send(body);
}

describe('POST /webhooks/paystack', () => {
  const event = JSON.stringify(
    chargeSuccessEvent({ reference: 'CLP-0123456789abcdef0123', amount: 4_064_400 }),
  );

  it.each([
    ['missing', undefined],
    ['wrong', signWebhook('{"event":"charge.success"}')],
  ])('refuses a %s signature with 401 and never logs the body', async (_name, signature) => {
    const target = app();

    const response = await postWebhook(target, event, signature);

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('unauthorized');
    expect(target.logs.output()).toContain('Paystack webhook refused');
    expect(target.logs.output()).not.toContain('CLP-0123456789abcdef0123');
    expect(target.logs.output()).not.toContain('4064400');
  });

  it('checks the signature over the exact bytes sent, not re-encoded JSON', async () => {
    const spaced = event.replace('{', '{ ');

    const response = await postWebhook(app(), spaced, signWebhook(event));

    expect(response.status).toBe(401);
  });

  it('answers 200 to a signed event it does not act on', async () => {
    const body = JSON.stringify({ event: 'transfer.success', data: {} });

    const response = await postWebhook(app(), body, signWebhook(body));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('answers 200 to a signed charge for a reference it does not know', async () => {
    const target = app();

    const response = await postWebhook(target, event, signWebhook(event));

    expect(response.status).toBe(200);
    expect(target.logs.output()).toContain('CLP-***0123');
    expect(target.logs.output()).not.toContain('CLP-0123456789abcdef0123');
  });

  it('is 400 for a signed body that is not JSON', async () => {
    const response = await postWebhook(app(), 'not json', signWebhook('not json'));

    expect(response.status).toBe(400);
  });

  it('refuses every webhook while Paystack is not configured', async () => {
    const logs = captureLogs();
    const db = stubDatabase();
    const routes = apiRoutes({ db, config: testConfig, logger: logs.logger });
    const target = { app: createApp(testConfig, { db, logger: logs.logger, routes }) };

    const response = await request(target.app)
      .post('/api/v1/webhooks/paystack')
      .set('x-paystack-signature', signWebhook(event))
      .send(event);

    expect(response.status).toBe(401);
  });
});

describe('payment endpoints for farmers', () => {
  const bookingId = '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f';

  it.each([['provider'], ['admin']] as const)('refuse a %s with 403', async (role) => {
    const target = app([role]);
    const auth = await bearer([role]);

    const initialize = await request(target.app)
      .post('/api/v1/payments/initialize')
      .set('Authorization', auth)
      .send({ booking_id: bookingId });
    const verify = await request(target.app)
      .get('/api/v1/payments/CLP-0123456789abcdef0123/verify')
      .set('Authorization', auth);

    expect([initialize.status, verify.status]).toEqual([403, 403]);
    expect(target.payments.initialized).toEqual([]);
  });

  it('need a signed-in user', async () => {
    const response = await request(app().app)
      .post('/api/v1/payments/initialize')
      .send({ booking_id: bookingId });

    expect(response.status).toBe(401);
  });

  it('take only a booking id, never an amount', async () => {
    const response = await request(app().app)
      .post('/api/v1/payments/initialize')
      .set('Authorization', await bearer(['farmer']))
      .send({ booking_id: bookingId, amount_kobo: 100 });

    expect(response.status).toBe(400);
  });

  it('refuse a reference ColdLink could not have made', async () => {
    const response = await request(app().app)
      .get('/api/v1/payments/not-a-reference/verify')
      .set('Authorization', await bearer(['farmer']));

    expect(response.status).toBe(400);
  });
});
