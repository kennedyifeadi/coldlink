import { randomUUID } from 'node:crypto';
import {
  errorResponseSchema,
  initializedPaymentSchema,
  paymentVerificationSchema,
  type BookingStatus,
  type UserRole,
} from '@coldlink/shared';
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import { createBackgroundTasks } from '../backgroundTasks.js';
import { createTransitionHooks } from '../bookings/hooks.js';
import { runBookingTransition, type BookingActor } from '../bookings/transition.js';
import { createDatabase, type Database } from '../db/client.js';
import { registerRefundHooks } from '../payments/refundHooks.js';
import { lockProvider } from '../providers/store.js';
import { deleteBooking, insertBooking, type BookingFixture } from '../test/bookings.js';
import { captureLogs, testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import {
  chargeSuccessEvent,
  fakePaymentGateway,
  insertCharge,
  paymentRows,
  setHold,
  signWebhook,
} from '../test/payments.js';
import { insertOccupancy, insertTestUser, setConfig } from '../test/search.js';
import { requireTestDatabaseUrl } from '../test/testDatabase.js';
import { apiRoutes } from './index.js';

// The PRD 6.1 worked example booking from insertBooking: 2 sqm for 30 days from 1 December, with
// everything paid online being the deposit.
const TOTAL = 4_064_400;
// 09:00 in Lagos on 10 November 2026, well before the booking starts.
const NOW = new Date('2026-11-10T08:00:00Z');

const tokens = createAccessTokens(testConfig.auth.jwtSecret);

async function bearer(db: Database, userId: string): Promise<string> {
  const user = await db
    .selectFrom('users')
    .select(['id', 'coldlink_id', 'roles'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const token = await tokens.sign({
    sub: user.id,
    cid: user.coldlink_id,
    roles: user.roles as UserRole[],
  });
  return `Bearer ${token}`;
}

function buildApp(db: Database, payments = fakePaymentGateway()) {
  const logs = captureLogs();
  const tasks = createBackgroundTasks();
  const routes = apiRoutes({
    db,
    config: testConfig,
    logger: logs.logger,
    paymentGateway: payments.gateway,
    tasks,
    now: () => NOW,
  });
  return { app: createApp(testConfig, { db, logger: logs.logger, routes }), logs, tasks, payments };
}

type TestApp = ReturnType<typeof buildApp>;

async function postWebhook(target: TestApp, event: object) {
  const body = JSON.stringify(event);
  const response = await request(target.app)
    .post('/api/v1/webhooks/paystack')
    .set('Content-Type', 'application/json')
    .set('x-paystack-signature', signWebhook(body))
    .send(body);
  await target.tasks.drain();
  return response;
}

function bookingRow(db: Database, id: string) {
  return db.selectFrom('bookings').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

function eventsTo(db: Database, bookingId: string, to: BookingStatus) {
  return db
    .selectFrom('booking_events')
    .selectAll()
    .where('booking_id', '=', bookingId)
    .where('to_status', '=', to)
    .execute();
}

async function setStatus(db: Database, id: string, status: BookingStatus) {
  await db.updateTable('bookings').set({ status }).where('id', '=', id).execute();
}

describe.skipIf(noTestDatabase)('payments against Postgres', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let farmerAuth: string;

  beforeEach(async () => {
    await setConfig(db(), 'provider_response_minutes', 120);
    await setConfig(db(), 'paystack_channels', ['card', 'bank', 'ussd', 'bank_transfer']);
    booking = await insertBooking(db(), 'payment_pending');
    await setHold(db(), booking.bookingId, 30);
    farmerAuth = await bearer(db(), booking.farmerId);
  });

  describe('POST /payments/initialize', () => {
    function initialize(target: TestApp, bookingId = booking.bookingId, auth = farmerAuth) {
      return request(target.app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', auth)
        .send({ booking_id: bookingId });
    }

    it("charges the booking's own online total, with the configured channels", async () => {
      await setConfig(db(), 'paystack_channels', ['card', 'ussd']);
      const target = buildApp(db());
      const { coldlink_id } = await db()
        .selectFrom('users')
        .select('coldlink_id')
        .where('id', '=', booking.farmerId)
        .executeTakeFirstOrThrow();

      const response = await initialize(target);

      expect(response.status).toBe(200);
      const body = initializedPaymentSchema.parse(response.body);
      expect(body.authorization_url).toBe(`https://checkout.paystack.test/${body.reference}`);
      expect(target.payments.initialized).toEqual([
        {
          reference: body.reference,
          amountKobo: TOTAL,
          email: `farmer-${coldlink_id}@example.com`,
          callbackUrl: 'https://app.coldlink.test/payment/return',
          channels: ['card', 'ussd'],
        },
      ]);
      expect(await paymentRows(db(), booking.bookingId)).toEqual([
        expect.objectContaining({
          provider_ref: body.reference,
          purpose: 'booking_deposit',
          amount_kobo: TOTAL,
          status: 'initiated',
          paid_at: null,
          paystack_payload: {
            authorization_url: body.authorization_url,
            access_code: 'access-1',
          },
        }),
      ]);
    });

    it('reuses the open payment when called again', async () => {
      const target = buildApp(db());

      const first = initializedPaymentSchema.parse((await initialize(target)).body);
      const second = await initialize(target);

      expect(second.status).toBe(200);
      expect(initializedPaymentSchema.parse(second.body)).toEqual(first);
      expect(target.payments.initialized).toHaveLength(1);
      expect(await paymentRows(db(), booking.bookingId)).toHaveLength(1);
    });

    it("is the same 404 for another farmer's booking as for an unknown one", async () => {
      const target = buildApp(db());
      const otherAuth = await bearer(db(), await insertTestUser(db(), 'farmer'));

      const responses = [
        await initialize(target, booking.bookingId, otherAuth),
        await initialize(target, randomUUID()),
      ];

      expect(responses.map((response) => response.status)).toEqual([404, 404]);
      expect(target.payments.initialized).toEqual([]);
      expect(await paymentRows(db(), booking.bookingId)).toEqual([]);
    });

    it('is 409 for a booking that is not awaiting payment', async () => {
      await setStatus(db(), booking.bookingId, 'pending_provider');

      const response = await initialize(buildApp(db()));

      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error).toMatchObject({
        code: 'conflict',
        details: { booking_id: booking.bookingId, status: 'pending_provider' },
      });
    });

    it('is 409 once the hold has lapsed', async () => {
      await setHold(db(), booking.bookingId, -1);

      const response = await initialize(buildApp(db()));

      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error.message).toBe(
        'The time to pay for this booking has run out',
      );
      expect(await paymentRows(db(), booking.bookingId)).toEqual([]);
    });

    it('closes a payment Paystack would not start, and starts afresh next time', async () => {
      const target = buildApp(db());
      target.payments.state.failInitialize = true;

      expect((await initialize(target)).status).toBe(500);
      target.payments.state.failInitialize = false;
      const retry = initializedPaymentSchema.parse((await initialize(target)).body);

      const rows = await paymentRows(db(), booking.bookingId);
      expect(rows.map((row) => row.status).toSorted()).toEqual(['failed', 'initiated']);
      expect(rows.find((row) => row.status === 'initiated')?.provider_ref).toBe(retry.reference);
    });
  });

  describe('POST /webhooks/paystack', () => {
    let reference: string;

    beforeEach(async () => {
      reference = await insertCharge(db(), {
        bookingId: booking.bookingId,
        status: 'initiated',
        amountKobo: TOTAL,
      });
    });

    it('confirms the payment and asks the provider, with the response clock from paid_at', async () => {
      const response = await postWebhook(
        buildApp(db()),
        chargeSuccessEvent({ reference, amount: TOTAL }),
      );

      expect(response.status).toBe(200);
      const [payment] = await paymentRows(db(), booking.bookingId);
      expect(payment).toMatchObject({ status: 'success' });
      expect(payment?.paid_at).toBeInstanceOf(Date);
      expect(payment?.paystack_payload).toMatchObject({
        charge: { id: '4099260516', amount: TOTAL, currency: 'NGN', channel: 'card' },
      });
      expect(JSON.stringify(payment?.paystack_payload)).not.toMatch(/AUTH_fake|example.com/);
      const row = await bookingRow(db(), booking.bookingId);
      expect(row.status).toBe('pending_provider');
      expect(row.provider_response_due_at?.getTime()).toBe(
        (payment?.paid_at?.getTime() ?? 0) + 120 * 60_000,
      );
      expect(await eventsTo(db(), booking.bookingId, 'pending_provider')).toEqual([
        expect.objectContaining({
          from_status: 'payment_pending',
          actor_type: 'system',
          actor_id: null,
          metadata: { payment_reference: reference },
        }),
      ]);
    });

    it('treats a replayed event as a no-op', async () => {
      const target = buildApp(db());
      const event = chargeSuccessEvent({ reference, amount: TOTAL });
      await postWebhook(target, event);
      const after = await bookingRow(db(), booking.bookingId);
      const payment = await paymentRows(db(), booking.bookingId);

      const replay = await postWebhook(target, event);

      expect(replay.status).toBe(200);
      expect(await bookingRow(db(), booking.bookingId)).toEqual(after);
      expect(await paymentRows(db(), booking.bookingId)).toEqual(payment);
      expect(await eventsTo(db(), booking.bookingId, 'pending_provider')).toHaveLength(1);
      expect(target.payments.refunds).toEqual([]);
    });

    it.each([
      ['an amount other than the online total', { amount: TOTAL - 1 }],
      ['another currency', { amount: TOTAL, currency: 'USD' }],
    ])('changes nothing for %s', async (_name, charge) => {
      const target = buildApp(db());

      const response = await postWebhook(target, chargeSuccessEvent({ reference, ...charge }));

      expect(response.status).toBe(200);
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('payment_pending');
      expect((await paymentRows(db(), booking.bookingId))[0]?.status).toBe('initiated');
      expect(target.logs.output()).toContain('Paystack charge does not match its booking');
    });

    describe('a late payment', () => {
      async function expectRefundedInFull(target: TestApp) {
        expect(target.payments.refunds).toEqual([
          { chargeReference: reference, amountKobo: TOTAL },
        ]);
        const rows = await paymentRows(db(), booking.bookingId);
        expect(rows).toEqual([
          expect.objectContaining({ purpose: 'booking_deposit', status: 'refunded' }),
          expect.objectContaining({ purpose: 'refund', amount_kobo: TOTAL, status: 'success' }),
        ]);
        expect(target.logs.output()).toContain('Late payment');
      }

      it('is refunded in full when the booking has already expired', async () => {
        await setStatus(db(), booking.bookingId, 'expired');
        const target = buildApp(db());

        await postWebhook(target, chargeSuccessEvent({ reference, amount: TOTAL }));

        expect((await bookingRow(db(), booking.bookingId)).status).toBe('expired');
        expect(await eventsTo(db(), booking.bookingId, 'pending_provider')).toEqual([]);
        await expectRefundedInFull(target);
      });

      it('is refunded in full when the hold lapsed and the space has gone', async () => {
        await setHold(db(), booking.bookingId, -1);
        await insertOccupancy(db(), {
          providerId: booking.providerId,
          farmerId: await insertTestUser(db(), 'farmer'),
          cropId: (await bookingRow(db(), booking.bookingId)).crop_id,
          quantity: 49,
          capacityUnit: 'sqm',
          startDate: '2026-12-10',
          days: 5,
        });
        const target = buildApp(db());

        await postWebhook(target, chargeSuccessEvent({ reference, amount: TOTAL }));

        expect((await bookingRow(db(), booking.bookingId)).status).toBe('payment_pending');
        await expectRefundedInFull(target);
      });

      it('still takes the booking when the hold lapsed but the space is free', async () => {
        await setHold(db(), booking.bookingId, -1);
        const target = buildApp(db());

        await postWebhook(target, chargeSuccessEvent({ reference, amount: TOTAL }));

        expect((await bookingRow(db(), booking.bookingId)).status).toBe('pending_provider');
        expect(target.payments.refunds).toEqual([]);
      });
    });
  });

  describe('GET /payments/:reference/verify', () => {
    let reference: string;

    beforeEach(async () => {
      reference = await insertCharge(db(), {
        bookingId: booking.bookingId,
        status: 'initiated',
        amountKobo: TOTAL,
      });
    });

    function verify(target: TestApp, auth = farmerAuth) {
      return request(target.app)
        .get(`/api/v1/payments/${reference}/verify`)
        .set('Authorization', auth);
    }

    it('confirms a paid charge as the webhook would', async () => {
      const target = buildApp(db());
      target.payments.pay(reference, TOTAL);

      const response = await verify(target);

      expect(response.status).toBe(200);
      expect(paymentVerificationSchema.parse(response.body)).toEqual({
        reference,
        payment_status: 'success',
        booking_id: booking.bookingId,
        booking_status: 'pending_provider',
      });
      expect((await bookingRow(db(), booking.bookingId)).provider_response_due_at).not.toBeNull();
    });

    it('changes nothing for a charge Paystack does not report as paid', async () => {
      const target = buildApp(db());
      target.payments.pay(reference, TOTAL);
      target.payments.charges.set(reference, {
        ...(target.payments.charges.get(reference) ?? never()),
        status: 'abandoned',
      });

      const response = await verify(target);

      expect(paymentVerificationSchema.parse(response.body)).toMatchObject({
        payment_status: 'initiated',
        booking_status: 'payment_pending',
      });
    });

    it('does not ask Paystack again once the charge is settled', async () => {
      const target = buildApp(db());
      target.payments.pay(reference, TOTAL);
      await verify(target);
      target.payments.charges.clear();

      const response = await verify(target);

      expect(paymentVerificationSchema.parse(response.body).booking_status).toBe(
        'pending_provider',
      );
    });

    it('reports a late payment as refunded', async () => {
      await setStatus(db(), booking.bookingId, 'expired');
      const target = buildApp(db());
      target.payments.pay(reference, TOTAL);

      const response = await verify(target);

      expect(paymentVerificationSchema.parse(response.body)).toMatchObject({
        payment_status: 'refunded',
        booking_status: 'expired',
      });
    });

    it('is 409 for a charge that does not match the booking', async () => {
      const target = buildApp(db());
      target.payments.pay(reference, TOTAL, 'USD');

      const response = await verify(target);

      expect(response.status).toBe(409);
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('payment_pending');
    });

    it("is 404 for another farmer's payment, without asking Paystack", async () => {
      const target = buildApp(db());
      target.payments.pay(reference, TOTAL);

      const response = await verify(
        target,
        await bearer(db(), await insertTestUser(db(), 'farmer')),
      );

      expect(response.status).toBe(404);
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('payment_pending');
    });
  });

  describe('refunds', () => {
    const SERVICE_FEE = 20_000;
    const DEPOSIT = 4_064_400;
    let payments: ReturnType<typeof fakePaymentGateway>;
    let hooks: ReturnType<typeof createTransitionHooks>;
    let chargeReference: string;

    // A paid booking with a service fee, so a deposit-only refund is less than the whole charge.
    beforeEach(async () => {
      await db()
        .updateTable('bookings')
        .set({ service_fee_kobo: SERVICE_FEE, total_charged_online_kobo: DEPOSIT + SERVICE_FEE })
        .where('id', '=', booking.bookingId)
        .execute();
      chargeReference = await insertCharge(db(), {
        bookingId: booking.bookingId,
        status: 'success',
        amountKobo: DEPOSIT + SERVICE_FEE,
      });
      payments = fakePaymentGateway();
      hooks = createTransitionHooks();
      registerRefundHooks(hooks, {
        db: db(),
        gateway: payments.gateway,
        logger: captureLogs().logger,
      });
    });

    function move(from: BookingStatus, to: BookingStatus, actor: BookingActor) {
      return setStatus(db(), booking.bookingId, from).then(() =>
        runBookingTransition(
          { db: db(), hooks, logger: captureLogs().logger },
          { bookingId: booking.bookingId, to, actor },
        ),
      );
    }

    async function refundRows() {
      return (await paymentRows(db(), booking.bookingId)).filter((row) => row.purpose === 'refund');
    }

    async function expectFullRefund() {
      expect(payments.refunds).toEqual([{ chargeReference, amountKobo: DEPOSIT + SERVICE_FEE }]);
      expect(await paymentRows(db(), booking.bookingId)).toEqual([
        expect.objectContaining({ purpose: 'booking_deposit', status: 'refunded' }),
        expect.objectContaining({
          purpose: 'refund',
          amount_kobo: DEPOSIT + SERVICE_FEE,
          status: 'success',
          paid_at: expect.any(Date) as Date,
          paystack_payload: expect.objectContaining({
            charge_reference: chargeReference,
            paystack_refund_id: 'refund-1',
          }) as object,
        }),
      ]);
    }

    it('refunds everything when the provider rejects', async () => {
      await move('pending_provider', 'rejected', { type: 'provider', id: booking.ownerId });
      await expectFullRefund();
    });

    it('refunds everything when the provider does not answer in time', async () => {
      await move('pending_provider', 'expired', { type: 'system' });
      await expectFullRefund();
    });

    it('refunds nothing when an unpaid hold expires', async () => {
      await move('payment_pending', 'expired', { type: 'system' });
      expect(payments.refunds).toEqual([]);
      expect(await refundRows()).toEqual([]);
    });

    it.each([
      ['provider', () => booking.ownerId],
      ['admin', () => booking.farmerId],
    ] as const)('refunds everything when a %s cancels', async (type, id) => {
      await move('confirmed', 'cancelled', { type, id: id() });
      await expectFullRefund();
    });

    describe("the farmer's cancellation", () => {
      function cancel(at: Date) {
        const logs = captureLogs();
        const routes = apiRoutes({
          db: db(),
          config: testConfig,
          logger: logs.logger,
          paymentGateway: payments.gateway,
          bookingHooks: createTransitionHooks(),
          now: () => at,
        });
        return request(createApp(testConfig, { db: db(), logger: logs.logger, routes }))
          .post(`/api/v1/bookings/${booking.bookingId}/cancel`)
          .set('Authorization', farmerAuth)
          .send({});
      }

      it('refunds everything before the provider accepts', async () => {
        await setStatus(db(), booking.bookingId, 'pending_provider');

        expect((await cancel(NOW)).status).toBe(200);

        await expectFullRefund();
      });

      it('refunds the deposit but not the service fee after acceptance', async () => {
        await setStatus(db(), booking.bookingId, 'confirmed');

        expect((await cancel(NOW)).status).toBe(200);

        expect(payments.refunds).toEqual([{ chargeReference, amountKobo: DEPOSIT }]);
        expect(await paymentRows(db(), booking.bookingId)).toEqual([
          expect.objectContaining({ purpose: 'booking_deposit', status: 'partially_refunded' }),
          expect.objectContaining({ purpose: 'refund', amount_kobo: DEPOSIT, status: 'success' }),
        ]);
      });

      it('makes no refund call when the policy refunds nothing', async () => {
        await setStatus(db(), booking.bookingId, 'confirmed');

        // Less than 24 hours before 00:00 on 1 December in Lagos.
        const response = await cancel(new Date('2026-11-30T12:00:00Z'));

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ refund_kobo: 0 });
        expect(payments.refunds).toEqual([]);
        expect(await refundRows()).toEqual([]);
        expect((await paymentRows(db(), booking.bookingId))[0]?.status).toBe('success');
      });
    });

    it('records a failed refund for a retry and keeps the transition', async () => {
      payments.state.failRefunds = true;

      await move('pending_provider', 'rejected', { type: 'provider', id: booking.ownerId });

      expect((await bookingRow(db(), booking.bookingId)).status).toBe('rejected');
      expect(await paymentRows(db(), booking.bookingId)).toEqual([
        expect.objectContaining({ purpose: 'booking_deposit', status: 'success' }),
        expect.objectContaining({
          purpose: 'refund',
          amount_kobo: DEPOSIT + SERVICE_FEE,
          status: 'failed',
          paid_at: null,
          paystack_payload: expect.objectContaining({
            charge_reference: chargeReference,
            reason: 'rejected',
            error: 'Paystack refund returned HTTP 400',
          }) as object,
        }),
      ]);
    });

    it('never refunds a booking twice', async () => {
      payments.state.failRefunds = true;
      await move('pending_provider', 'rejected', { type: 'provider', id: booking.ownerId });
      payments.state.failRefunds = false;

      await move('pending_provider', 'rejected', { type: 'provider', id: booking.ownerId });

      expect(payments.refunds).toHaveLength(1);
      expect(await refundRows()).toHaveLength(1);
    });
  });
});

function never(): never {
  throw new Error('Expected a value');
}

// Commits, since both requests must wait on the provider lock held by another connection, and the
// second only sees the first's confirmation once it is committed. The rows are deleted afterwards
// (decision 53).
describe.skipIf(noTestDatabase)('the webhook and verify racing for one payment', () => {
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

  async function waitForLockWaits(count: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await sql<{ waiting: number }>`
        select count(*)::int as waiting from pg_catalog.pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
      `.execute(database());
      if ((rows[0]?.waiting ?? 0) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${count} requests never waited on the provider lock`);
  }

  it('advances the booking exactly once', async () => {
    const db = database();
    const fixture = await insertBooking(db, 'payment_pending');
    try {
      await setHold(db, fixture.bookingId, 30);
      const reference = await insertCharge(db, {
        bookingId: fixture.bookingId,
        status: 'initiated',
        amountKobo: TOTAL,
      });
      const target = buildApp(db);
      target.payments.pay(reference, TOTAL);
      const auth = await bearer(db, fixture.farmerId);
      const event = JSON.stringify(chargeSuccessEvent({ reference, amount: TOTAL }));

      const holder = await db.startTransaction().execute();
      let responses: Promise<request.Response[]> = Promise.resolve([]);
      try {
        await lockProvider(holder, fixture.providerId);
        responses = Promise.all([
          request(target.app)
            .post('/api/v1/webhooks/paystack')
            .set('Content-Type', 'application/json')
            .set('x-paystack-signature', signWebhook(event))
            .send(event)
            .then((response) => response),
          request(target.app)
            .get(`/api/v1/payments/${reference}/verify`)
            .set('Authorization', auth)
            .then((response) => response),
        ]);
        await waitForLockWaits(2);
        await holder.commit().execute();
      } catch (error) {
        await holder.rollback().execute();
        throw error;
      }

      const results = await responses;
      await target.tasks.drain();
      expect(results.map((response) => response.status)).toEqual([200, 200]);
      expect(paymentVerificationSchema.parse(results[1]?.body).booking_status).toBe(
        'pending_provider',
      );
      expect(await eventsTo(db, fixture.bookingId, 'pending_provider')).toHaveLength(1);
      expect((await paymentRows(db, fixture.bookingId)).map((row) => row.status)).toEqual([
        'success',
      ]);
    } finally {
      await db.deleteFrom('payments').where('booking_id', '=', fixture.bookingId).execute();
      await deleteBooking(db, fixture);
    }
  });
});
