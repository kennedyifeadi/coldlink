import {
  cancelledDeliverySchema,
  deliveryQuoteSchema,
  errorResponseSchema,
  farmerBookingSchema,
  farmerDeliverySchema,
  initializedPaymentSchema,
  paymentVerificationSchema,
  type BookingStatus,
  type UserRole,
} from '@coldlink/shared';
import { sql } from 'kysely';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import { createBackgroundTasks } from '../backgroundTasks.js';
import {
  runAfterCommitHooks,
  transitionBooking,
  type BookingActor,
} from '../bookings/transition.js';
import { createBookingServices } from '../services.js';
import { captureLogs, testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { fakeSmsProvider } from '../test/notifications.js';
import { chargeSuccessEvent, fakePaymentGateway, signWebhook } from '../test/payments.js';
import {
  categoryIdsBySlug,
  cropIdByName,
  insertSearchProvider,
  insertTestUser,
  setConfig,
} from '../test/search.js';
import { fakePhotoStorage } from '../test/storage.js';
import { apiRoutes } from './index.js';

// 09:00 in Lagos on 10 November 2026.
const NOW = new Date('2026-11-10T08:00:00Z');
const UNKNOWN_ID = '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f';

const FACILITY = { lat: 7.4, lng: 3.9 };
// 0.1° of latitude north: 11.11951 km, × 1.3 = 14.4554, kept as 14.5 km.
const FARM = { lat: 7.5, lng: 3.9 };
// ₦1,000 + 14.5 km × ₦100 = ₦2,450; 80% to the partner.
const FEE = 245_000;
const PAYOUT = 196_000;
const MARGIN = 49_000;
// 10 crates × 7 days × ₦500 = ₦35,000, 30% of it paid online, no service fee.
const DEPOSIT = 1_050_000;

const START = '2026-11-20';
const END = '2026-11-27';

const tokens = createAccessTokens(testConfig.auth.jwtSecret);

const deliveryDetails = {
  address_text: 'Akinyele farm road, by the blue gate',
  location: FARM,
  contact_phone: '0800 912 3456',
  contact_name: 'Bola',
  load_description: 'Tomatoes in crates',
  load_quantity: 5,
  load_unit: 'crates',
  scheduled_for: '2026-11-18',
};

describe.skipIf(noTestDatabase)('deliveries against Postgres', () => {
  const db = useTestTransaction();
  let farmerId: string;
  let otherFarmerId: string;
  let ownerId: string;
  let providerId: string;
  let tomatoesId: string;

  beforeEach(async () => {
    for (const [key, value] of Object.entries({
      deposit_percent: 0.3,
      commission_rate: 0.075,
      service_fee_kobo: 0,
      require_provider_approval: true,
      provider_response_minutes: 120,
      payment_hold_minutes: 30,
      delivery_base_fee_kobo: 100_000,
      delivery_per_km_kobo: 10_000,
      delivery_min_fee_kobo: 100_000,
      delivery_partner_share: 0.8,
      road_distance_factor: 1.3,
    })) {
      await setConfig(db(), key, value);
    }
    farmerId = await insertTestUser(db(), 'farmer');
    otherFarmerId = await insertTestUser(db(), 'farmer');
    ownerId = await insertTestUser(db(), 'provider');
    tomatoesId = await cropIdByName(db(), 'Tomatoes');
    const vegetablesId = (await categoryIdsBySlug(db())).get('vegetables') ?? '';
    providerId = await insertSearchProvider(db(), {
      ownerId,
      location: FACILITY,
      categoryIds: [vegetablesId],
      displayName: 'Delivery test cold room',
      capacityTotal: 100,
      pricePerUnitPerDayKobo: 50_000,
    });
  });

  function build() {
    const logs = captureLogs();
    const payments = fakePaymentGateway();
    const services = createBookingServices({
      db: db(),
      config: testConfig,
      logger: logs.logger,
      sms: fakeSmsProvider().provider,
      gateway: payments.gateway,
    });
    const tasks = createBackgroundTasks();
    const routes = apiRoutes({
      db: db(),
      config: testConfig,
      logger: logs.logger,
      storage: fakePhotoStorage().storage,
      services,
      tasks,
      now: () => NOW,
    });
    const app = createApp(testConfig, { db: db(), logger: logs.logger, routes });
    return { app, logs, payments, services, tasks };
  }

  type Target = ReturnType<typeof build>;

  async function bearer(userId: string): Promise<string> {
    const user = await db()
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

  function bookingBody(changes: Record<string, unknown> = {}) {
    return {
      provider_id: providerId,
      crop_id: tomatoesId,
      quantity: 10,
      capacity_unit: 'crates',
      days: 7,
      start_date: START,
      ...changes,
    };
  }

  async function book(target: Target, delivery?: Record<string, unknown>) {
    const response = await request(target.app)
      .post('/api/v1/bookings')
      .set('Authorization', await bearer(farmerId))
      .send(bookingBody(delivery === undefined ? {} : { delivery }));
    expect(response.status).toBe(201);
    return farmerBookingSchema.parse(response.body);
  }

  async function postWebhook(target: Target, reference: string, amount: number) {
    const body = JSON.stringify(chargeSuccessEvent({ reference, amount }));
    const response = await request(target.app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signWebhook(body))
      .send(body);
    await target.tasks.drain();
    expect(response.status).toBe(200);
  }

  async function initialize(target: Target, body: object, userId = farmerId) {
    return request(target.app)
      .post('/api/v1/payments/initialize')
      .set('Authorization', await bearer(userId))
      .send(body);
  }

  /** Books, pays through the webhook and returns the booking, now pending_provider. */
  async function bookAndPay(target: Target, delivery?: Record<string, unknown>) {
    const booking = await book(target, delivery);
    const started = await initialize(target, { booking_id: booking.id });
    const { reference } = initializedPaymentSchema.parse(started.body);
    await postWebhook(target, reference, booking.total_charged_online_kobo);
    return { booking, reference };
  }

  async function move(target: Target, bookingId: string, to: BookingStatus, actor: BookingActor) {
    const result = await transitionBooking(db(), target.services.hooks, { bookingId, to, actor });
    await runAfterCommitHooks(target.logs.logger, result);
    expect(target.logs.output()).not.toContain('Booking after-commit hook failed');
  }

  async function confirmedBooking(target: Target, delivery?: Record<string, unknown>) {
    const paid = await bookAndPay(target, delivery);
    await move(target, paid.booking.id, 'confirmed', { type: 'provider', id: ownerId });
    return paid;
  }

  function deliveriesOf(bookingId: string) {
    return db()
      .selectFrom('delivery_requests')
      .selectAll()
      .where('context_id', '=', bookingId)
      .orderBy('created_at')
      .execute();
  }

  function paymentsOf(bookingId: string) {
    return db()
      .selectFrom('payments')
      .selectAll()
      .where('booking_id', '=', bookingId)
      .orderBy('created_at')
      .orderBy('provider_ref')
      .execute();
  }

  async function refundsOf(bookingId: string) {
    return (await paymentsOf(bookingId)).filter((row) => row.purpose === 'refund');
  }

  function chargeRef(row: { paystack_payload: unknown }): unknown {
    return (row.paystack_payload as Record<string, unknown>).charge_reference;
  }

  async function requestLater(
    target: Target,
    bookingId: string,
    changes: Record<string, unknown> = {},
    userId = farmerId,
  ) {
    return request(target.app)
      .post('/api/v1/deliveries')
      .set('Authorization', await bearer(userId))
      .send({
        booking_id: bookingId,
        direction: 'outbound',
        ...deliveryDetails,
        scheduled_for: '2026-11-25',
        ...changes,
      });
  }

  async function payLater(target: Target, deliveryId: string) {
    const started = await initialize(target, { delivery_request_id: deliveryId });
    expect(started.status).toBe(200);
    return initializedPaymentSchema.parse(started.body).reference;
  }

  async function countRows() {
    const counts: number[] = [];
    for (const table of ['delivery_requests', 'payments', 'bookings'] as const) {
      const { n } = await db()
        .selectFrom(table)
        .select(sql<string>`count(*)`.as('n'))
        .executeTakeFirstOrThrow();
      counts.push(Number(n));
    }
    return counts;
  }

  function expectNoPartnerMoney(body: unknown) {
    const text = JSON.stringify(body);
    expect(text).not.toContain('partner_payout');
    expect(text).not.toContain('platform_margin');
    expect(text).not.toContain(String(PAYOUT));
    expect(text).not.toContain('+2348009123456');
  }

  describe('POST /deliveries/quote', () => {
    it('quotes an inbound delivery for a facility, writing nothing', async () => {
      const target = build();
      const before = await countRows();

      const response = await request(target.app).post('/api/v1/deliveries/quote').send({
        direction: 'inbound',
        provider_id: providerId,
        start_date: START,
        location: FARM,
        load_quantity: 5,
        load_unit: 'crates',
      });

      expect(response.status).toBe(200);
      expect(deliveryQuoteSchema.parse(response.body)).toEqual({
        direction: 'inbound',
        distance_km: 14.5,
        vehicle_type: 'bike',
        fee_kobo: FEE,
        earliest_date: '2026-11-10',
        latest_date: START,
      });
      expectNoPartnerMoney(response.body);
      expect(await countRows()).toEqual(before);
    });

    it('sends a van from the configured threshold', async () => {
      const response = await request(build().app).post('/api/v1/deliveries/quote').send({
        direction: 'inbound',
        provider_id: providerId,
        location: FARM,
        load_quantity: 6,
        load_unit: 'crates',
      });
      expect(deliveryQuoteSchema.parse(response.body).vehicle_type).toBe('van');
    });

    it("quotes an outbound delivery for the farmer's own booking, with its window", async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const before = await countRows();

      const response = await request(target.app)
        .post('/api/v1/deliveries/quote')
        .set('Authorization', await bearer(farmerId))
        .send({
          direction: 'outbound',
          booking_id: booking.id,
          location: FARM,
          load_quantity: 5,
          load_unit: 'crates',
        });

      expect(deliveryQuoteSchema.parse(response.body)).toMatchObject({
        direction: 'outbound',
        fee_kobo: FEE,
        earliest_date: START,
        latest_date: END,
      });
      expect(await countRows()).toEqual(before);
    });

    it("is the same 404 for someone else's booking, an unknown one and no sign-in", async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const body = {
        direction: 'outbound',
        location: FARM,
        load_quantity: 5,
        load_unit: 'crates',
      };
      const other = await request(target.app)
        .post('/api/v1/deliveries/quote')
        .set('Authorization', await bearer(otherFarmerId))
        .send({ ...body, booking_id: booking.id });
      const unknown = await request(target.app)
        .post('/api/v1/deliveries/quote')
        .set('Authorization', await bearer(farmerId))
        .send({ ...body, booking_id: UNKNOWN_ID });
      const anonymous = await request(target.app)
        .post('/api/v1/deliveries/quote')
        .send({ ...body, booking_id: booking.id });

      for (const response of [other, unknown, anonymous]) {
        expect(response.status).toBe(404);
        expect(errorResponseSchema.parse(response.body).error.message).toBe('Booking not found');
      }
    });

    it('refuses a booking that cannot take that delivery, with 409', async () => {
      const target = build();
      const booking = await book(target);
      const response = await request(target.app)
        .post('/api/v1/deliveries/quote')
        .set('Authorization', await bearer(farmerId))
        .send({
          direction: 'inbound',
          booking_id: booking.id,
          location: FARM,
          load_quantity: 5,
          load_unit: 'crates',
        });
      expect(response.status).toBe(409);
    });
  });

  describe('POST /bookings with a delivery', () => {
    it('adds the fee to the online total and records the delivery unpaid', async () => {
      const target = build();

      const booking = await book(target, deliveryDetails);

      expect(booking.delivery_fee_kobo).toBe(FEE);
      expect(booking.deposit_kobo).toBe(DEPOSIT);
      expect(booking.total_charged_online_kobo).toBe(DEPOSIT + FEE);
      const row = await db()
        .selectFrom('bookings')
        .selectAll()
        .where('id', '=', booking.id)
        .executeTakeFirstOrThrow();
      // Decision 26's check, which the insert already passed.
      expect(row.total_charged_online_kobo).toBe(
        row.deposit_kobo + row.service_fee_kobo + row.delivery_fee_kobo,
      );

      const [delivery, ...others] = await deliveriesOf(booking.id);
      expect(others).toEqual([]);
      expect(delivery).toMatchObject({
        context_type: 'booking_inbound',
        requested_by: farmerId,
        status: 'requested',
        paid_at: null,
        partner_id: null,
        pickup_text: deliveryDetails.address_text,
        dropoff_text: 'Delivery test cold room, Test address',
        contact_name: 'Bola',
        contact_phone: '+2348009123456',
        load_description: 'Tomatoes in crates',
        load_quantity: 5,
        load_unit: 'crates',
        distance_km: 14.5,
        vehicle_type: 'bike',
        fee_kobo: FEE,
        partner_payout_kobo: PAYOUT,
        platform_margin_kobo: MARGIN,
      });
      expect(delivery?.handover_code).toMatch(/^[0-9]{4}$/);
      expect(delivery?.scheduled_for?.toISOString()).toBe('2026-11-17T23:00:00.000Z');
    });

    it('quotes the same total in POST /bookings/quote', async () => {
      const response = await request(build().app)
        .post('/api/v1/bookings/quote')
        .send({
          ...bookingBody(),
          crop_id: undefined,
          delivery: { location: FARM, load_quantity: 5, load_unit: 'crates' },
        });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        delivery_fee_kobo: FEE,
        total_charged_online_kobo: DEPOSIT + FEE,
        delivery: { direction: 'inbound', fee_kobo: FEE, latest_date: START },
      });
    });

    it('charges the delivery in the Paystack amount and marks it paid with the booking', async () => {
      const target = build();
      const { booking } = await bookAndPay(target, deliveryDetails);

      expect(target.payments.initialized[0]?.amountKobo).toBe(DEPOSIT + FEE);
      const [delivery] = await deliveriesOf(booking.id);
      expect(delivery?.paid_at).not.toBeNull();
    });

    it('refuses a day outside the inbound window, with 400 on delivery.scheduled_for', async () => {
      const target = build();
      for (const day of ['2026-11-09', '2026-11-21']) {
        const response = await request(target.app)
          .post('/api/v1/bookings')
          .set('Authorization', await bearer(farmerId))
          .send(bookingBody({ delivery: { ...deliveryDetails, scheduled_for: day } }));
        expect(response.status).toBe(400);
        const issues = errorResponseSchema.parse(response.body).error.details as {
          path: string;
        }[];
        expect(issues.map((issue) => issue.path)).toEqual(['delivery.scheduled_for']);
      }
      expect(await db().selectFrom('delivery_requests').selectAll().execute()).toEqual([]);
    });

    it('takes no fee from the body', async () => {
      const response = await request(build().app)
        .post('/api/v1/bookings')
        .set('Authorization', await bearer(farmerId))
        .send(bookingBody({ delivery: { ...deliveryDetails, fee_kobo: 1 } }));
      expect(response.status).toBe(400);
    });
  });

  describe('a delivery requested later', () => {
    it('is created requested and unpaid, priced on the server', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);

      const response = await requestLater(target, booking.id);

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      const delivery = farmerDeliverySchema.parse(response.body);
      expect(delivery).toMatchObject({
        booking_id: booking.id,
        direction: 'outbound',
        status: 'requested',
        paid: false,
        pickup_text: 'Delivery test cold room, Test address',
        dropoff_text: deliveryDetails.address_text,
        dropoff_location: FARM,
        contact_phone_masked: '+234800***3456',
        fee_kobo: FEE,
        distance_km: 14.5,
        scheduled_for: '2026-11-25',
        cancellation: { allowed: true, refund_kobo: 0 },
      });
      expect(delivery.handover_code).toMatch(/^[0-9]{4}$/);
      expectNoPartnerMoney(response.body);
    });

    it('is paid through its own charge and settles once, with no booking change', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const events = await db()
        .selectFrom('booking_events')
        .select('id')
        .where('booking_id', '=', booking.id)
        .execute();

      const reference = await payLater(target, delivery.id);
      expect(target.payments.initialized.at(-1)?.amountKobo).toBe(FEE);
      await postWebhook(target, reference, FEE);
      const paidAt = (await deliveriesOf(booking.id))[0]?.paid_at;
      await postWebhook(target, reference, FEE);

      const charge = (await paymentsOf(booking.id)).find((row) => row.provider_ref === reference);
      expect(charge).toMatchObject({
        purpose: 'delivery_fee',
        delivery_request_id: delivery.id,
        amount_kobo: FEE,
        status: 'success',
      });
      expect(paidAt).not.toBeNull();
      expect((await deliveriesOf(booking.id))[0]?.paid_at).toEqual(paidAt);
      const after = await db()
        .selectFrom('booking_events')
        .select('id')
        .where('booking_id', '=', booking.id)
        .execute();
      expect(after).toHaveLength(events.length);
      const read = await request(target.app)
        .get(`/api/v1/deliveries/${delivery.id}`)
        .set('Authorization', await bearer(farmerId));
      expect(farmerDeliverySchema.parse(read.body)).toMatchObject({
        paid: true,
        cancellation: { allowed: true, refund_kobo: FEE },
      });
    });

    it('settles through verify too', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const reference = await payLater(target, delivery.id);
      target.payments.pay(reference, FEE);

      const response = await request(target.app)
        .get(`/api/v1/payments/${reference}/verify`)
        .set('Authorization', await bearer(farmerId));

      expect(paymentVerificationSchema.parse(response.body)).toEqual({
        reference,
        payment_status: 'success',
        booking_id: booking.id,
        booking_status: 'confirmed',
        delivery_request_id: delivery.id,
      });
      expect((await deliveriesOf(booking.id))[0]?.paid_at).not.toBeNull();
    });

    it('reuses the open charge when initialize is called again', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const first = await payLater(target, delivery.id);
      const second = await payLater(target, delivery.id);
      expect(second).toBe(first);
    });

    it('refunds a payment that arrives after the booking was cancelled, in full', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const reference = await payLater(target, delivery.id);
      await move(target, booking.id, 'cancelled', { type: 'provider', id: ownerId });
      expect((await deliveriesOf(booking.id))[0]?.status).toBe('cancelled');

      await postWebhook(target, reference, FEE);

      const deliveryRefunds = (await refundsOf(booking.id)).filter(
        (row) => row.delivery_request_id === delivery.id,
      );
      expect(deliveryRefunds).toHaveLength(1);
      expect(deliveryRefunds[0]).toMatchObject({ amount_kobo: FEE, status: 'success' });
      expect(chargeRef(deliveryRefunds[0] ?? { paystack_payload: {} })).toBe(reference);
      expect((await deliveriesOf(booking.id))[0]?.paid_at).toBeNull();
    });

    it('refuses to pay for a delivery that is not awaiting payment, with 409', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target, deliveryDetails);
      const [atBooking] = await deliveriesOf(booking.id);
      const response = await initialize(target, { delivery_request_id: atBooking?.id });
      expect(response.status).toBe(409);
    });

    it('replaces an unpaid request in the same direction', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const first = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const second = await requestLater(target, booking.id);

      expect(second.status).toBe(201);
      const replacement = farmerDeliverySchema.parse(second.body);
      const rows = await deliveriesOf(booking.id);
      expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toEqual({
        [first.id]: 'cancelled',
        [replacement.id]: 'requested',
      });
      expect(target.logs.output()).not.toContain('Delivery cancelled');
    });

    it('refuses a second live delivery in the same direction, with 409', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      await postWebhook(target, await payLater(target, delivery.id), FEE);

      const response = await requestLater(target, booking.id);

      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error.details).toEqual({
        booking_id: booking.id,
        delivery_request_id: delivery.id,
      });
    });

    it('refuses a second inbound delivery after one paid with the booking, with 409', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target, deliveryDetails);
      const response = await requestLater(target, booking.id, {
        direction: 'inbound',
        scheduled_for: '2026-11-15',
      });
      expect(response.status).toBe(409);
    });

    it('refuses a day outside the window with 400 on scheduled_for', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      for (const [direction, day] of [
        ['outbound', '2026-11-19'],
        ['outbound', '2026-11-28'],
        ['inbound', '2026-11-21'],
        ['inbound', '2026-11-09'],
      ]) {
        const response = await requestLater(target, booking.id, { direction, scheduled_for: day });
        expect(response.status).toBe(400);
        const issues = errorResponseSchema.parse(response.body).error.details as {
          path: string;
        }[];
        expect(issues.map((issue) => issue.path)).toEqual(['scheduled_for']);
      }
    });

    it('refuses a booking that does not take that delivery, with 409', async () => {
      const target = build();
      const unpaid = await book(target);
      expect((await requestLater(target, unpaid.id)).status).toBe(409);

      const { booking } = await confirmedBooking(target);
      await db()
        .updateTable('bookings')
        .set({ status: 'in_storage', checked_in_at: sql<Date>`now()` })
        .where('id', '=', booking.id)
        .execute();
      const inbound = await requestLater(target, booking.id, {
        direction: 'inbound',
        scheduled_for: '2026-11-15',
      });
      expect(inbound.status).toBe(409);
      expect((await requestLater(target, booking.id)).status).toBe(201);
    });

    it("is the same 404 for someone else's booking or delivery as for an unknown one", async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const other = await bearer(otherFarmerId);

      const responses = [
        await requestLater(target, booking.id, {}, otherFarmerId),
        await requestLater(target, UNKNOWN_ID),
        await request(target.app)
          .get(`/api/v1/deliveries/${delivery.id}`)
          .set('Authorization', other),
        await request(target.app)
          .get(`/api/v1/deliveries/${UNKNOWN_ID}`)
          .set('Authorization', await bearer(farmerId)),
        await request(target.app)
          .post(`/api/v1/deliveries/${delivery.id}/cancel`)
          .set('Authorization', other),
        await initialize(target, { delivery_request_id: delivery.id }, otherFarmerId),
      ];
      for (const response of responses) expect(response.status).toBe(404);
      expect((await deliveriesOf(booking.id))[0]?.status).toBe('requested');
    });

    it('is for farmers only', async () => {
      const target = build();
      const response = await request(target.app)
        .get(`/api/v1/deliveries/${UNKNOWN_ID}`)
        .set('Authorization', await bearer(ownerId));
      expect(response.status).toBe(403);
    });
  });

  describe('POST /deliveries/:id/cancel', () => {
    async function cancel(target: Target, id: string) {
      return request(target.app)
        .post(`/api/v1/deliveries/${id}/cancel`)
        .set('Authorization', await bearer(farmerId));
    }

    it("refunds a separately paid fee against the delivery's own charge, and alerts admins", async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const reference = await payLater(target, delivery.id);
      await postWebhook(target, reference, FEE);

      const response = await cancel(target, delivery.id);

      expect(response.status).toBe(200);
      const body = cancelledDeliverySchema.parse(response.body);
      expect(body).toMatchObject({ status: 'cancelled', refund_kobo: FEE });
      expectNoPartnerMoney(response.body);
      const refunds = await refundsOf(booking.id);
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({
        delivery_request_id: delivery.id,
        amount_kobo: FEE,
        status: 'success',
      });
      expect(chargeRef(refunds[0] ?? { paystack_payload: {} })).toBe(reference);
      const charge = (await paymentsOf(booking.id)).find((row) => row.provider_ref === reference);
      expect(charge?.status).toBe('refunded');
      expect(target.logs.output()).toContain('Delivery cancelled');
    });

    it("refunds a fee paid with the booking as a part refund of the booking's charge", async () => {
      const target = build();
      const { booking, reference } = await confirmedBooking(target, deliveryDetails);
      const [atBooking] = await deliveriesOf(booking.id);

      const response = await cancel(target, atBooking?.id ?? '');

      expect(cancelledDeliverySchema.parse(response.body).refund_kobo).toBe(FEE);
      const refunds = await refundsOf(booking.id);
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ delivery_request_id: atBooking?.id, amount_kobo: FEE });
      expect(chargeRef(refunds[0] ?? { paystack_payload: {} })).toBe(reference);
      const charge = (await paymentsOf(booking.id)).find((row) => row.provider_ref === reference);
      expect(charge?.status).toBe('partially_refunded');
      expect(target.logs.output()).toContain('Delivery cancelled');
    });

    it('refunds nothing for an unpaid request, and raises no alert', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);

      const response = await cancel(target, delivery.id);

      expect(cancelledDeliverySchema.parse(response.body).refund_kobo).toBe(0);
      expect(await refundsOf(booking.id)).toEqual([]);
      expect(target.logs.output()).not.toContain('Delivery cancelled');
    });

    it('is refused once picked up, and while its booking awaits payment', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target, deliveryDetails);
      const [atBooking] = await deliveriesOf(booking.id);
      const partnerUser = await insertTestUser(db(), 'farmer');
      const { id: partnerId } = await db()
        .insertInto('delivery_partners')
        .values({
          user_id: partnerUser,
          company_name: 'Test Logistics',
          phone: '+2348009000001',
          vehicle_types: ['bike'],
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await db()
        .updateTable('delivery_requests')
        .set({
          status: 'picked_up',
          partner_id: partnerId,
          assigned_at: sql<Date>`now()`,
          picked_up_at: sql<Date>`now()`,
        })
        .where('id', '=', atBooking?.id ?? '')
        .execute();

      expect((await cancel(target, atBooking?.id ?? '')).status).toBe(409);

      const unpaid = await book(target, deliveryDetails);
      const [pending] = await deliveriesOf(unpaid.id);
      expect((await cancel(target, pending?.id ?? '')).status).toBe(409);
      expect(await refundsOf(booking.id)).toEqual([]);
    });
  });

  describe('a booking that ends with deliveries', () => {
    async function refundTotal(bookingId: string) {
      return (await refundsOf(bookingId)).reduce((sum, row) => sum + row.amount_kobo, 0);
    }

    it('refunds a rejected booking and its delivery once each, adding up to the charge', async () => {
      const target = build();
      const { booking, reference } = await bookAndPay(target, deliveryDetails);
      const [delivery] = await deliveriesOf(booking.id);

      await move(target, booking.id, 'rejected', { type: 'provider', id: ownerId });

      expect((await deliveriesOf(booking.id))[0]?.status).toBe('cancelled');
      const refunds = await refundsOf(booking.id);
      expect(
        refunds.map((row) => [row.delivery_request_id, row.amount_kobo, chargeRef(row)]),
      ).toEqual(
        expect.arrayContaining([
          [null, DEPOSIT, reference],
          [delivery?.id, FEE, reference],
        ]),
      );
      expect(refunds).toHaveLength(2);
      expect(await refundTotal(booking.id)).toBe(DEPOSIT + FEE);
      const charge = (await paymentsOf(booking.id)).find((row) => row.provider_ref === reference);
      expect(charge?.status).toBe('refunded');
      expect(target.logs.output()).toContain('Delivery cancelled');
    });

    it('does not refund a delivery twice when it was cancelled before the booking was', async () => {
      const target = build();
      const { booking } = await bookAndPay(target, deliveryDetails);
      await move(target, booking.id, 'confirmed', { type: 'provider', id: ownerId });
      const [delivery] = await deliveriesOf(booking.id);
      await request(target.app)
        .post(`/api/v1/deliveries/${delivery?.id ?? ''}/cancel`)
        .set('Authorization', await bearer(farmerId));

      await move(target, booking.id, 'cancelled', { type: 'provider', id: ownerId });

      const refunds = await refundsOf(booking.id);
      expect(refunds.map((row) => [row.delivery_request_id, row.amount_kobo])).toEqual(
        expect.arrayContaining([
          [delivery?.id, FEE],
          [null, DEPOSIT],
        ]),
      );
      expect(refunds).toHaveLength(2);
      expect(await refundTotal(booking.id)).toBe(DEPOSIT + FEE);
    });

    it("refunds a no-show's later delivery against its own charge, not the deposit", async () => {
      const target = build();
      const { booking, reference } = await confirmedBooking(target);
      const delivery = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const deliveryReference = await payLater(target, delivery.id);
      await postWebhook(target, deliveryReference, FEE);

      await move(target, booking.id, 'no_show', { type: 'system' });

      const refunds = await refundsOf(booking.id);
      // A no-show forfeits the deposit (PRD 6.5); the delivery that never happened is refunded.
      expect(
        refunds.map((row) => [row.delivery_request_id, row.amount_kobo, chargeRef(row)]),
      ).toEqual([[delivery.id, FEE, deliveryReference]]);
      expect(refunds.some((row) => chargeRef(row) === reference)).toBe(false);
    });

    it('refunds the deposit and both fees when a provider times out', async () => {
      const target = build();
      const { booking, reference } = await bookAndPay(target, deliveryDetails);
      await move(target, booking.id, 'expired', { type: 'system' });

      const refunds = await refundsOf(booking.id);
      expect(refunds).toHaveLength(2);
      expect(refunds.every((row) => chargeRef(row) === reference)).toBe(true);
      expect(await refundTotal(booking.id)).toBe(DEPOSIT + FEE);
    });

    it('refunds a farmer cancelling early the deposit and the fee, and late the fee alone', async () => {
      const target = build();
      const early = await confirmedBooking(target, deliveryDetails);
      const cancel = (id: string) =>
        bearer(farmerId).then((auth) =>
          request(target.app).post(`/api/v1/bookings/${id}/cancel`).set('Authorization', auth),
        );

      const preview = farmerBookingSchema.parse(
        (
          await request(target.app)
            .get(`/api/v1/bookings/${early.booking.id}`)
            .set('Authorization', await bearer(farmerId))
        ).body,
      ).cancellation;
      expect(preview).toMatchObject({ allowed: true, refund_kobo: DEPOSIT + FEE });
      const response = await cancel(early.booking.id);
      expect(response.body).toMatchObject({ refund_kobo: DEPOSIT + FEE });
      expect(await refundTotal(early.booking.id)).toBe(DEPOSIT + FEE);
      expect(await refundsOf(early.booking.id)).toHaveLength(2);

      // Past the free window the deposit is forfeit, but the delivery is still refunded. The
      // config is cached per reader, so a new app reads the longer window.
      const late = await confirmedBooking(target, deliveryDetails);
      await setConfig(db(), 'farmer_free_cancel_hours', 24 * 30);
      const lateTarget = build();
      const lateResponse = await request(lateTarget.app)
        .post(`/api/v1/bookings/${late.booking.id}/cancel`)
        .set('Authorization', await bearer(farmerId));
      expect(lateResponse.body).toMatchObject({ refund_kobo: FEE });
      expect(
        (await refundsOf(late.booking.id)).map((row) => [row.delivery_request_id, row.amount_kobo]),
      ).toEqual([[(await deliveriesOf(late.booking.id))[0]?.id, FEE]]);
    });

    it('cancels an unpaid delivery with a lapsed hold and refunds nothing', async () => {
      const target = build();
      const booking = await book(target, deliveryDetails);

      await move(target, booking.id, 'expired', { type: 'system' });

      expect((await deliveriesOf(booking.id))[0]).toMatchObject({
        status: 'cancelled',
        paid_at: null,
      });
      expect(await refundsOf(booking.id)).toEqual([]);
      expect(target.logs.output()).not.toContain('Delivery cancelled');
    });
  });

  describe("the full booking's deliveries", () => {
    async function readBooking(target: Target, bookingId: string) {
      const response = await request(target.app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', await bearer(farmerId));
      expect(response.status).toBe(200);
      expectNoPartnerMoney(response.body);
      return farmerBookingSchema.parse(response.body);
    }

    // A test's rows share one transaction, so its created_at; this puts one row a minute earlier.
    async function makeOlder(deliveryId: string) {
      await db()
        .updateTable('delivery_requests')
        .set({ created_at: sql<Date>`created_at - interval '1 minute'` })
        .where('id', '=', deliveryId)
        .execute();
    }

    it('is empty for a booking without one', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      expect((await readBooking(target, booking.id)).deliveries).toEqual([]);
    });

    it('lists the one asked for with the booking, unpaid and then paid', async () => {
      const target = build();
      const booking = await book(target, deliveryDetails);
      const [row] = await deliveriesOf(booking.id);
      const expected = {
        id: row?.id,
        direction: 'inbound',
        status: 'requested',
        scheduled_for: '2026-11-18',
        fee_kobo: FEE,
      };
      expect(booking.deliveries).toEqual([{ ...expected, paid: false }]);

      const started = await initialize(target, { booking_id: booking.id });
      const { reference } = initializedPaymentSchema.parse(started.body);
      await postWebhook(target, reference, booking.total_charged_online_kobo);

      expect((await readBooking(target, booking.id)).deliveries).toEqual([
        { ...expected, paid: true },
      ]);
    });

    it('leaves out an unpaid request that was replaced or cancelled', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target);
      const replaced = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      const replacement = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      expect((await readBooking(target, booking.id)).deliveries.map(({ id }) => id)).toEqual([
        replacement.id,
      ]);
      expect(replaced.id).not.toBe(replacement.id);

      const cancelled = await request(target.app)
        .post(`/api/v1/deliveries/${replacement.id}/cancel`)
        .set('Authorization', await bearer(farmerId));
      expect(cancelled.status).toBe(200);
      expect((await readBooking(target, booking.id)).deliveries).toEqual([]);
    });

    it('keeps a paid delivery that was cancelled, newest first', async () => {
      const target = build();
      const { booking } = await confirmedBooking(target, deliveryDetails);
      const [inbound] = await deliveriesOf(booking.id);
      await makeOlder(inbound?.id ?? '');
      const outbound = farmerDeliverySchema.parse((await requestLater(target, booking.id)).body);
      await postWebhook(target, await payLater(target, outbound.id), FEE);
      const cancelled = await request(target.app)
        .post(`/api/v1/deliveries/${outbound.id}/cancel`)
        .set('Authorization', await bearer(farmerId));
      expect(cancelled.status).toBe(200);

      expect((await readBooking(target, booking.id)).deliveries).toEqual([
        {
          id: outbound.id,
          direction: 'outbound',
          status: 'cancelled',
          paid: true,
          scheduled_for: '2026-11-25',
          fee_kobo: FEE,
        },
        {
          id: inbound?.id,
          direction: 'inbound',
          status: 'requested',
          paid: true,
          scheduled_for: '2026-11-18',
          fee_kobo: FEE,
        },
      ]);
    });
  });

  describe('GET /deliveries/:id', () => {
    it("shows the farmer the handover code and never the partner's money", async () => {
      const target = build();
      const { booking } = await confirmedBooking(target, deliveryDetails);
      const [row] = await deliveriesOf(booking.id);

      const response = await request(target.app)
        .get(`/api/v1/deliveries/${row?.id ?? ''}`)
        .set('Authorization', await bearer(farmerId));

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const delivery = farmerDeliverySchema.parse(response.body);
      expect(delivery).toMatchObject({
        direction: 'inbound',
        paid: true,
        handover_code: row?.handover_code,
        scheduled_for: '2026-11-18',
        pickup_location: FARM,
        dropoff_location: FACILITY,
      });
      expectNoPartnerMoney(response.body);
      expect(target.logs.output()).not.toContain('handover');
      expect(target.logs.output()).not.toContain('9123456');
    });
  });
});
