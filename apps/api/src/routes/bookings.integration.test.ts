import {
  bookingQuoteSchema,
  errorResponseSchema,
  type BookingQuote,
  type UserRole,
  type VerificationStatus,
} from '@coldlink/shared';
import { sql } from 'kysely';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import { captureLogs, testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import {
  categoryIdsBySlug,
  cropIdByName,
  insertOccupancy,
  insertSearchProvider,
  insertTestUser,
  setConfig,
  type SearchProviderFixture,
} from '../test/search.js';
import { fakePhotoStorage } from '../test/storage.js';
import { apiRoutes } from './index.js';

const location = { lat: 1, lng: 1 };
// 09:00 in Lagos on 10 November 2026.
const now = () => new Date('2026-11-10T08:00:00Z');
const TODAY = '2026-11-10';
const UNKNOWN_ID = '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f';

const tokens = createAccessTokens(testConfig.auth.jwtSecret);

describe.skipIf(noTestDatabase)('POST /bookings/quote against Postgres', () => {
  const db = useTestTransaction();
  let ownerId: string;
  let farmerId: string;
  let tomatoesId: string;
  let vegetablesId: string;

  beforeEach(async () => {
    ownerId = await insertTestUser(db(), 'provider');
    farmerId = await insertTestUser(db(), 'farmer');
    tomatoesId = await cropIdByName(db(), 'Tomatoes');
    vegetablesId = (await categoryIdsBySlug(db())).get('vegetables') ?? '';
    await setConfig(db(), 'deposit_percent', 0.3);
    await setConfig(db(), 'commission_rate', 0.075);
    await setConfig(db(), 'service_fee_kobo', 0);
    await setConfig(db(), 'require_provider_approval', true);
  });

  function app() {
    const logs = captureLogs();
    const routes = apiRoutes({
      db: db(),
      config: testConfig,
      logger: logs.logger,
      storage: fakePhotoStorage().storage,
      now,
    });
    return createApp(testConfig, { db: db(), logger: logs.logger, routes });
  }

  function provider(overrides: Partial<SearchProviderFixture> = {}) {
    return insertSearchProvider(db(), {
      ownerId,
      location,
      categoryIds: [vegetablesId],
      capacityTotal: 100,
      ...overrides,
    });
  }

  function post(body: Record<string, unknown>, token?: string) {
    const call = request(app()).post('/api/v1/bookings/quote');
    if (token !== undefined) call.set('Authorization', `Bearer ${token}`);
    return call.send({ quantity: 20, capacity_unit: 'crates', days: 14, ...body });
  }

  async function quote(body: Record<string, unknown>, token?: string): Promise<BookingQuote> {
    const response = await post(body, token);
    expect(response.status).toBe(200);
    return bookingQuoteSchema.parse(response.body);
  }

  async function errorOf(body: Record<string, unknown>, status: number) {
    const response = await post(body);
    expect(response.status).toBe(status);
    return errorResponseSchema.parse(response.body).error;
  }

  function occupy(providerId: string, quantity: number, startDate: string, days: number) {
    return insertOccupancy(db(), {
      providerId,
      farmerId,
      cropId: tomatoesId,
      quantity,
      startDate,
      days,
    });
  }

  it('prices the PRD 6.1 worked example to the kobo', async () => {
    const id = await provider({
      capacityUnit: 'sqm',
      capacityTotal: 10,
      pricePerUnitPerDayKobo: 225_800,
    });

    const response = await quote({
      provider_id: id,
      quantity: 2,
      capacity_unit: 'sqm',
      days: 30,
    });

    expect(response).toEqual({
      provider_id: id,
      quantity: 2,
      capacity_unit: 'sqm',
      start_date: TODAY,
      duration_days: 30,
      end_date: '2026-12-10',
      available_quantity: 10,
      unit_price_kobo: 225_800,
      storage_subtotal_kobo: 13_548_000,
      deposit_kobo: 4_064_400,
      balance_due_kobo: 9_483_600,
      service_fee_kobo: 0,
      delivery_fee_kobo: 0,
      total_charged_online_kobo: 4_064_400,
    });
  });

  it('adds the configured service fee to what is paid online', async () => {
    await setConfig(db(), 'service_fee_kobo', 20_000);
    const id = await provider({ pricePerUnitPerDayKobo: 50_000 });

    const response = await quote({ provider_id: id, quantity: 1, days: 10 });

    expect(response).toMatchObject({
      storage_subtotal_kobo: 500_000,
      deposit_kobo: 150_000,
      balance_due_kobo: 350_000,
      service_fee_kobo: 20_000,
      total_charged_online_kobo: 170_000,
    });
  });

  describe('capacity', () => {
    it('refuses more than is free on the busiest day, with 409 conflict', async () => {
      const id = await provider();
      await occupy(id, 90, '2026-11-12', 5);

      const error = await errorOf({ provider_id: id, quantity: 20 }, 409);

      expect(error).toMatchObject({
        code: 'conflict',
        details: { provider_id: id, available_quantity: 10 },
      });
    });

    it('quotes exactly what is free', async () => {
      const id = await provider();
      await occupy(id, 90, '2026-11-12', 5);

      expect((await quote({ provider_id: id, quantity: 10 })).available_quantity).toBe(10);
    });

    it('ignores bookings collected on or before the start date', async () => {
      const id = await provider();
      await occupy(id, 90, '2026-11-12', 5);

      const response = await quote({ provider_id: id, start_date: '2026-11-17' });

      expect(response).toMatchObject({ start_date: '2026-11-17', available_quantity: 100 });
    });
  });

  describe('which facilities can be quoted', () => {
    it('is 404 for an unknown facility', async () => {
      expect(await errorOf({ provider_id: UNKNOWN_ID }, 404)).toMatchObject({ code: 'not_found' });
    });

    it.each<VerificationStatus>(['pending', 'suspended', 'rejected'])(
      'is 404 for a %s facility while approval is required',
      async (verificationStatus) => {
        const id = await provider({ verificationStatus });
        expect(await errorOf({ provider_id: id }, 404)).toMatchObject({ code: 'not_found' });
      },
    );

    it('is 404 for a facility not taking bookings', async () => {
      const id = await provider({ isAcceptingBookings: false });
      expect(await errorOf({ provider_id: id }, 404)).toMatchObject({ code: 'not_found' });
    });

    it('quotes a pending facility when approval is not required, never a suspended one', async () => {
      await setConfig(db(), 'require_provider_approval', false);
      const pending = await provider({ verificationStatus: 'pending' });
      const suspended = await provider({ verificationStatus: 'suspended' });

      expect((await quote({ provider_id: pending })).provider_id).toBe(pending);
      expect(await errorOf({ provider_id: suspended }, 404)).toMatchObject({ code: 'not_found' });
    });
  });

  describe('terms', () => {
    it('refuses a quantity in another unit than the facility lists', async () => {
      const id = await provider({ capacityUnit: 'sqm' });

      const error = await errorOf({ provider_id: id, capacity_unit: 'crates' }, 400);

      expect(error).toMatchObject({
        code: 'validation_failed',
        details: [
          { location: 'body', path: 'capacity_unit', message: 'This facility is listed in sqm' },
        ],
      });
    });

    it("refuses fewer days than the facility's minimum", async () => {
      const id = await provider();
      await db()
        .updateTable('providers')
        .set({ min_storage_days: 7 })
        .where('id', '=', id)
        .execute();

      const error = await errorOf({ provider_id: id, days: 6 }, 400);
      expect(error).toMatchObject({
        code: 'validation_failed',
        details: [
          { location: 'body', path: 'days', message: 'This facility stores for at least 7 days' },
        ],
      });
      expect((await quote({ provider_id: id, days: 7 })).duration_days).toBe(7);
    });

    it('refuses a start date in the past', async () => {
      const id = await provider();

      const error = await errorOf({ provider_id: id, start_date: '2026-11-09' }, 400);

      expect(error).toMatchObject({
        code: 'validation_failed',
        details: [
          { location: 'body', path: 'start_date', message: 'Choose today or a later date' },
        ],
      });
    });
  });

  it('writes nothing, signed in or not', async () => {
    const id = await provider();
    const user = await db()
      .selectFrom('users')
      .select(['id', 'coldlink_id', 'roles'])
      .where('id', '=', farmerId)
      .executeTakeFirstOrThrow();
    const token = await tokens.sign({
      sub: user.id,
      cid: user.coldlink_id,
      roles: user.roles as UserRole[],
    });
    // This transaction's own inserts, updates and deletes on every table, fixtures included.
    const writes = async () => {
      const { rows } = await sql<{ writes: string }>`
        select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0)::text as writes
        from pg_stat_xact_all_tables
        where schemaname not in ('pg_catalog', 'information_schema')
      `.execute(db());
      return rows[0]?.writes;
    };
    const before = await writes();

    await quote({ provider_id: id });
    await quote({ provider_id: id }, token);
    await errorOf({ provider_id: id, quantity: 200 }, 409);

    expect(await writes()).toBe(before);
    // The counters are live within the transaction, so the check above can fail.
    await occupy(id, 1, TODAY, 1);
    expect(await writes()).not.toBe(before);
  });
});
