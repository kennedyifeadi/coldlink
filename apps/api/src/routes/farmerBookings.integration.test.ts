import { randomUUID } from 'node:crypto';
import {
  bookingQuoteSchema,
  cancelledBookingSchema,
  errorResponseSchema,
  farmerBookingSchema,
  farmerBookingsResponseSchema,
  type BookingStatus,
  type FarmerBooking,
  type UserRole,
} from '@coldlink/shared';
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import { createDatabase, type Database } from '../db/client.js';
import { lockProvider } from '../providers/store.js';
import { deleteCommittedRows } from '../test/bookings.js';
import { captureLogs, testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import {
  categoryIdsBySlug,
  cropIdByName,
  insertSearchProvider,
  insertTestUser,
  setConfig,
  type SearchProviderFixture,
} from '../test/search.js';
import { fakePhotoStorage } from '../test/storage.js';
import { requireTestDatabaseUrl } from '../test/testDatabase.js';
import { apiRoutes } from './index.js';

const location = { lat: 1, lng: 1 };
// 09:00 in Lagos on 10 November 2026.
const NOW = new Date('2026-11-10T08:00:00Z');
const TODAY = '2026-11-10';

const tokens = createAccessTokens(testConfig.auth.jwtSecret);

interface AppOptions {
  now?: Date;
  codes?: string[];
}

function buildApp(db: Database, { now = NOW, codes }: AppOptions = {}) {
  const logs = captureLogs();
  let next = 0;
  const routes = apiRoutes({
    db,
    config: testConfig,
    logger: logs.logger,
    storage: fakePhotoStorage().storage,
    now: () => now,
    // Hands out the given codes in turn, then repeats the last one.
    ...(codes === undefined
      ? {}
      : { generateBookingCode: () => codes[Math.min(next++, codes.length - 1)] ?? '' }),
  });
  return createApp(testConfig, { db, logger: logs.logger, routes });
}

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

function bookingRow(db: Database, id: string) {
  return db.selectFrom('bookings').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

function eventRows(db: Database, bookingId: string) {
  return db
    .selectFrom('booking_events')
    .selectAll()
    .where('booking_id', '=', bookingId)
    .orderBy('id')
    .execute();
}

describe.skipIf(noTestDatabase)('farmer booking endpoints against Postgres', () => {
  const db = useTestTransaction();
  let ownerId: string;
  let farmerId: string;
  let farmerAuth: string;
  let tomatoesId: string;
  let orangesId: string;
  let vegetablesId: string;

  beforeEach(async () => {
    ownerId = await insertTestUser(db(), 'provider');
    farmerId = await insertTestUser(db(), 'farmer');
    farmerAuth = await bearer(db(), farmerId);
    tomatoesId = await cropIdByName(db(), 'Tomatoes');
    orangesId = await cropIdByName(db(), 'Oranges');
    vegetablesId = (await categoryIdsBySlug(db())).get('vegetables') ?? '';
    await setConfig(db(), 'deposit_percent', 0.3);
    await setConfig(db(), 'commission_rate', 0.075);
    await setConfig(db(), 'service_fee_kobo', 0);
    await setConfig(db(), 'payment_hold_minutes', 15);
    await setConfig(db(), 'farmer_free_cancel_hours', 24);
    await setConfig(db(), 'require_provider_approval', true);
  });

  function provider(overrides: Partial<SearchProviderFixture> = {}) {
    return insertSearchProvider(db(), {
      ownerId,
      location,
      categoryIds: [vegetablesId],
      capacityTotal: 100,
      ...overrides,
    });
  }

  function postBooking(
    body: Record<string, unknown>,
    { auth = farmerAuth, ...options }: AppOptions & { auth?: string } = {},
  ) {
    return request(buildApp(db(), options))
      .post('/api/v1/bookings')
      .set('Authorization', auth)
      .send({ crop_id: tomatoesId, quantity: 20, capacity_unit: 'crates', days: 14, ...body });
  }

  async function book(
    body: Record<string, unknown>,
    options: AppOptions & { auth?: string } = {},
  ): Promise<FarmerBooking> {
    const response = await postBooking(body, options);
    expect(response.status).toBe(201);
    return farmerBookingSchema.parse(response.body);
  }

  async function bookingError(body: Record<string, unknown>, status: number) {
    const response = await postBooking(body);
    expect(response.status).toBe(status);
    return errorResponseSchema.parse(response.body).error;
  }

  function get(path: string, auth = farmerAuth) {
    return request(buildApp(db())).get(`/api/v1${path}`).set('Authorization', auth);
  }

  function cancel(id: string, body: Record<string, unknown> = {}, now = NOW, auth = farmerAuth) {
    return request(buildApp(db(), { now }))
      .post(`/api/v1/bookings/${id}/cancel`)
      .set('Authorization', auth)
      .send(body);
  }

  async function setStatus(id: string, status: BookingStatus) {
    await db().updateTable('bookings').set({ status }).where('id', '=', id).execute();
  }

  async function bookingCount(providerId: string): Promise<number> {
    const { count } = await db()
      .selectFrom('bookings')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('provider_id', '=', providerId)
      .executeTakeFirstOrThrow();
    return Number(count);
  }

  describe('POST /bookings', () => {
    it('books the PRD 6.1 worked example and snapshots every price, rate and fee', async () => {
      const id = await provider({
        capacityUnit: 'sqm',
        capacityTotal: 10,
        pricePerUnitPerDayKobo: 225_800,
      });

      const booking = await book({ provider_id: id, quantity: 2, capacity_unit: 'sqm', days: 30 });

      expect(booking).toMatchObject({
        status: 'payment_pending',
        provider: { id, display_name: 'Search test cold room', lga: null },
        crop: { id: tomatoesId, name: 'Tomatoes' },
        quantity: 2,
        capacity_unit: 'sqm',
        start_date: TODAY,
        duration_days: 30,
        end_date: '2026-12-10',
        unit_price_kobo: 225_800,
        storage_subtotal_kobo: 13_548_000,
        deposit_kobo: 4_064_400,
        balance_due_kobo: 9_483_600,
        service_fee_kobo: 0,
        delivery_fee_kobo: 0,
        total_charged_online_kobo: 4_064_400,
        provider_response_due_at: null,
        cancelled_by: null,
      });
      expect(booking.code).toMatch(/^CL-[A-HJ-NP-Z2-9]{5}$/);
      expect(await bookingRow(db(), booking.id)).toMatchObject({
        farmer_id: farmerId,
        capacity_unit: 'sqm',
        commission_rate: 0.075,
        commission_kobo: 1_016_100,
        deposit_percent: 0.3,
      });
    });

    it('holds the capacity for payment_hold_minutes from now', async () => {
      await setConfig(db(), 'payment_hold_minutes', 30);
      const booking = await book({ provider_id: await provider() });

      const { rows } = await sql<{ held_until_now_plus_30: boolean }>`
        select payment_expires_at = now() + interval '30 minutes' as held_until_now_plus_30
        from public.bookings where id = ${booking.id}
      `.execute(db());
      expect(rows[0]?.held_until_now_plus_30).toBe(true);
      expect(booking.payment_expires_at).not.toBeNull();
    });

    it('records the creation as an event by the farmer', async () => {
      const booking = await book({ provider_id: await provider() });

      expect(await eventRows(db(), booking.id)).toEqual([
        expect.objectContaining({
          from_status: null,
          to_status: 'payment_pending',
          actor_type: 'farmer',
          actor_id: farmerId,
          metadata: {},
        }),
      ]);
    });

    it('takes the space it books, so the next request sees less free', async () => {
      const id = await provider();
      await book({ provider_id: id, quantity: 60 });

      const error = await bookingError({ provider_id: id, quantity: 50 }, 409);

      expect(error).toMatchObject({
        code: 'conflict',
        details: { provider_id: id, available_quantity: 40 },
      });
      expect(await bookingCount(id)).toBe(1);
    });

    it('refuses a crop whose category the facility does not store', async () => {
      const id = await provider();

      const error = await bookingError({ provider_id: id, crop_id: orangesId }, 400);

      expect(error).toMatchObject({
        code: 'validation_failed',
        details: [
          {
            location: 'body',
            path: 'crop_id',
            message: 'This facility does not store that crop',
          },
        ],
      });
      expect(await bookingCount(id)).toBe(0);
    });

    it('refuses an unknown crop', async () => {
      const error = await bookingError(
        { provider_id: await provider(), crop_id: randomUUID() },
        400,
      );
      expect(error).toMatchObject({
        code: 'validation_failed',
        details: [{ location: 'body', path: 'crop_id', message: 'Unknown crop' }],
      });
    });

    it('refuses the terms a quote refuses', async () => {
      const id = await provider({ capacityUnit: 'sqm' });
      await db()
        .updateTable('providers')
        .set({ min_storage_days: 7 })
        .where('id', '=', id)
        .execute();

      expect(await bookingError({ provider_id: id, capacity_unit: 'crates' }, 400)).toMatchObject({
        details: [{ path: 'capacity_unit' }],
      });
      expect(
        await bookingError({ provider_id: id, capacity_unit: 'sqm', days: 6 }, 400),
      ).toMatchObject({ details: [{ path: 'days' }] });
    });

    it.each<[string, Partial<SearchProviderFixture>]>([
      ['suspended', { verificationStatus: 'suspended' }],
      ['pending while approval is required', { verificationStatus: 'pending' }],
      ['not taking bookings', { isAcceptingBookings: false }],
    ])('is 404 for a facility that is %s', async (_name, overrides) => {
      const id = await provider(overrides);
      expect(await bookingError({ provider_id: id }, 404)).toMatchObject({ code: 'not_found' });
      expect(await bookingCount(id)).toBe(0);
    });

    it('is 404 for an unknown facility', async () => {
      expect(await bookingError({ provider_id: randomUUID() }, 404)).toMatchObject({
        code: 'not_found',
      });
    });

    it('draws another code when the first is taken', async () => {
      const id = await provider();
      const first = await book({ provider_id: id }, { codes: ['CL-ZZZZ2'] });

      const second = await book({ provider_id: id }, { codes: ['CL-ZZZZ2', 'CL-ZZZZ3'] });

      expect(first.code).toBe('CL-ZZZZ2');
      expect(second.code).toBe('CL-ZZZZ3');
      expect(await eventRows(db(), second.id)).toHaveLength(1);
    });

    it('gives up after a bounded number of taken codes and writes nothing', async () => {
      const id = await provider();
      await book({ provider_id: id }, { codes: ['CL-ZZZZ2'] });

      const response = await postBooking({ provider_id: id }, { codes: ['CL-ZZZZ2'] });

      expect(response.status).toBe(500);
      expect(await bookingCount(id)).toBe(1);
    });
  });

  describe('snapshots', () => {
    it('keeps the booking as booked when the price and rates change afterwards', async () => {
      const id = await provider({ pricePerUnitPerDayKobo: 50_000 });
      const booked = await book({ provider_id: id, quantity: 10, days: 10 });
      const storedBefore = await bookingRow(db(), booked.id);

      await db()
        .updateTable('providers')
        .set({ price_per_unit_per_day_kobo: 90_000 })
        .where('id', '=', id)
        .execute();
      await setConfig(db(), 'commission_rate', 0.1);
      await setConfig(db(), 'deposit_percent', 0.4);
      await setConfig(db(), 'service_fee_kobo', 5_000);

      const response = await get(`/bookings/${booked.id}`);
      expect(response.status).toBe(200);
      expect(farmerBookingSchema.parse(response.body)).toEqual(booked);
      expect(await bookingRow(db(), booked.id)).toEqual(storedBefore);

      // The new values are live: a quote now uses them.
      const quote = await request(buildApp(db()))
        .post('/api/v1/bookings/quote')
        .send({ provider_id: id, quantity: 10, capacity_unit: 'crates', days: 10 });
      expect(bookingQuoteSchema.parse(quote.body)).toMatchObject({
        unit_price_kobo: 90_000,
        deposit_kobo: 3_600_000,
        service_fee_kobo: 5_000,
      });
    });
  });

  describe('GET /bookings', () => {
    async function setCreatedAt(id: string, iso: string) {
      await db()
        .updateTable('bookings')
        .set({ created_at: new Date(iso) })
        .where('id', '=', id)
        .execute();
    }

    it("lists only the farmer's own bookings, newest first, with id breaking ties", async () => {
      const id = await provider();
      const oldest = await book({ provider_id: id, quantity: 1 });
      const tiedA = await book({ provider_id: id, quantity: 2 });
      const tiedB = await book({ provider_id: id, quantity: 3 });
      const otherFarmer = await insertTestUser(db(), 'farmer');
      await book({ provider_id: id, quantity: 4 }, { auth: await bearer(db(), otherFarmer) });
      // Every insert in one transaction shares now(), so the order is set explicitly.
      await setCreatedAt(oldest.id, '2026-11-01T10:00:00Z');
      await setCreatedAt(tiedA.id, '2026-11-03T10:00:00Z');
      await setCreatedAt(tiedB.id, '2026-11-03T10:00:00Z');

      const response = await get('/bookings');

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { data } = farmerBookingsResponseSchema.parse(response.body);
      const tied = [tiedA.id, tiedB.id].toSorted().toReversed();
      expect(data.map((booking) => booking.id)).toEqual([...tied, oldest.id]);
      expect(data.at(-1)).toEqual({
        id: oldest.id,
        code: oldest.code,
        status: 'payment_pending',
        provider: { id, display_name: 'Search test cold room', lga: null },
        crop: { id: tomatoesId, name: 'Tomatoes' },
        quantity: 1,
        capacity_unit: 'crates',
        start_date: TODAY,
        duration_days: 14,
        end_date: '2026-11-24',
        total_charged_online_kobo: oldest.total_charged_online_kobo,
        balance_due_kobo: oldest.balance_due_kobo,
        created_at: '2026-11-01T10:00:00.000Z',
      });
    });

    it('is an empty list for a farmer with no bookings', async () => {
      const response = await get('/bookings');
      expect(farmerBookingsResponseSchema.parse(response.body)).toEqual({ data: [] });
    });
  });

  describe('GET /bookings/:id', () => {
    it("is the same 404 for another farmer's booking as for an unknown id", async () => {
      const otherFarmer = await insertTestUser(db(), 'farmer');
      const theirs = await book(
        { provider_id: await provider() },
        { auth: await bearer(db(), otherFarmer) },
      );

      const forbidden = await get(`/bookings/${theirs.id}`);
      const unknown = await get(`/bookings/${randomUUID()}`);

      expect(forbidden.status).toBe(404);
      expect(unknown.status).toBe(404);
      const { error } = errorResponseSchema.parse(forbidden.body);
      expect(error).toMatchObject({ code: 'not_found', message: 'Booking not found' });
      expect(errorResponseSchema.parse(unknown.body).error.message).toBe(error.message);
    });
  });

  describe('POST /bookings/:id/cancel', () => {
    // Starts at 00:00 in Lagos on 12 November, which is 23:00 UTC on 11 November.
    async function bookingIn(status: BookingStatus) {
      await setConfig(db(), 'service_fee_kobo', 20_000);
      const booking = await book({
        provider_id: await provider({ pricePerUnitPerDayKobo: 50_000 }),
        quantity: 10,
        days: 10,
        start_date: '2026-11-12',
      });
      await setStatus(booking.id, status);
      return booking;
    }

    async function cancelled(response: request.Response) {
      expect(response.status).toBe(200);
      return cancelledBookingSchema.parse(response.body);
    }

    it('refunds everything paid online before the provider accepts', async () => {
      const booking = await bookingIn('pending_provider');

      const result = await cancelled(await cancel(booking.id, { reason: 'Harvest came early' }));

      expect(result).toMatchObject({
        status: 'cancelled',
        cancelled_by: 'farmer',
        cancel_reason: 'Harvest came early',
        total_charged_online_kobo: 1_520_000,
        refund_kobo: 1_520_000,
      });
      const events = await eventRows(db(), booking.id);
      expect(events.find((event) => event.to_status === 'cancelled')).toMatchObject({
        from_status: 'pending_provider',
        actor_type: 'farmer',
        actor_id: farmerId,
        metadata: { refund_kobo: 1_520_000, reason: 'Harvest came early' },
      });
    });

    it.each([
      ['well before the start', '2026-11-10T08:00:00Z', 1_500_000],
      ['exactly 24 hours before 00:00 in Lagos', '2026-11-10T23:00:00Z', 1_500_000],
      ['a moment later', '2026-11-10T23:00:00.001Z', 0],
    ])('after acceptance, refunds the deposit only if cancelled %s', async (_when, at, refund) => {
      const booking = await bookingIn('confirmed');

      const result = await cancelled(await cancel(booking.id, {}, new Date(at)));

      expect(result).toMatchObject({ status: 'cancelled', refund_kobo: refund });
      const events = await eventRows(db(), booking.id);
      expect(events.find((event) => event.to_status === 'cancelled')?.metadata).toEqual({
        refund_kobo: refund,
      });
    });

    it('cannot cancel a booking awaiting payment, which expires instead', async () => {
      const booking = await bookingIn('payment_pending');
      const before = await bookingRow(db(), booking.id);

      const response = await cancel(booking.id);

      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error).toMatchObject({
        code: 'conflict',
        details: { from: 'payment_pending', to: 'cancelled', actor_type: 'farmer' },
      });
      expect(await bookingRow(db(), booking.id)).toEqual(before);
    });

    it('refuses to cancel twice', async () => {
      const booking = await bookingIn('confirmed');
      await cancelled(await cancel(booking.id));

      const response = await cancel(booking.id);

      expect(response.status).toBe(409);
      expect(await eventRows(db(), booking.id)).toHaveLength(2);
    });

    it("is 404 for another farmer's booking and leaves it alone", async () => {
      const booking = await bookingIn('confirmed');
      const otherFarmer = await insertTestUser(db(), 'farmer');
      const before = await bookingRow(db(), booking.id);

      const response = await cancel(booking.id, {}, NOW, await bearer(db(), otherFarmer));

      expect(response.status).toBe(404);
      expect(errorResponseSchema.parse(response.body).error.code).toBe('not_found');
      expect(await bookingRow(db(), booking.id)).toEqual(before);
    });

    it('is 404 for an unknown booking', async () => {
      expect((await cancel(randomUUID())).status).toBe(404);
    });
  });
});

// Commits, since the second request only waits on the provider lock held by another connection and
// only sees the first booking once it is committed. The rows are deleted afterwards (decision 53).
describe.skipIf(noTestDatabase)('POST /bookings racing for the last space', () => {
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
    throw new Error(`${count} bookings never waited on the provider lock`);
  }

  it('lets exactly one of two simultaneous bookings take it', async () => {
    const db = database();
    const ownerId = await insertTestUser(db, 'provider');
    const farmerIds = [await insertTestUser(db, 'farmer'), await insertTestUser(db, 'farmer')];
    const vegetablesId = (await categoryIdsBySlug(db)).get('vegetables') ?? '';
    const providerId = await insertSearchProvider(db, {
      ownerId,
      location,
      categoryIds: [vegetablesId],
      capacityTotal: 10,
    });
    try {
      const tomatoesId = await cropIdByName(db, 'Tomatoes');
      const app = buildApp(db);
      const body = { provider_id: providerId, crop_id: tomatoesId, quantity: 10, days: 14 };
      const auths = await Promise.all(farmerIds.map((id) => bearer(db, id)));

      // Holding the provider's lock makes both requests reach it before either can book.
      const holder = await db.startTransaction().execute();
      let responses: Promise<request.Response[]> = Promise.resolve([]);
      try {
        await lockProvider(holder, providerId);
        responses = Promise.all(
          auths.map((auth) =>
            request(app)
              .post('/api/v1/bookings')
              .set('Authorization', auth)
              .send({ ...body, capacity_unit: 'crates' })
              .then((response) => response),
          ),
        );
        await waitForLockWaits(2);
        await holder.commit().execute();
      } catch (error) {
        await holder.rollback().execute();
        throw error;
      }

      const results = await responses;
      expect(results.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const refused = results.find((response) => response.status === 409);
      expect(errorResponseSchema.parse(refused?.body).error).toMatchObject({
        code: 'conflict',
        details: { provider_id: providerId, available_quantity: 0 },
      });
      const booked = await db
        .selectFrom('bookings')
        .select(['quantity', 'status'])
        .where('provider_id', '=', providerId)
        .execute();
      expect(booked).toEqual([{ quantity: 10, status: 'payment_pending' }]);
    } finally {
      await deleteCommittedRows(db, {
        providerIds: [providerId],
        userIds: [ownerId, ...farmerIds],
      });
    }
  });
});
