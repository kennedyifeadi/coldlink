import {
  calculatePricing,
  errorResponseSchema,
  searchResponseSchema,
  type SearchResponse,
  type UserRole,
} from '@coldlink/shared';
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
  northOf,
  setConfig,
  type SearchProviderFixture,
} from '../test/search.js';
import { fakePhotoStorage } from '../test/storage.js';
import { apiRoutes } from './index.js';

// Null Island, far from the dev seed and any real provider, so only this file's rows are in range.
const origin = { lat: 1, lng: 1 };
// 09:00 in Lagos on 10 November 2026.
const now = () => new Date('2026-11-10T08:00:00Z');
const TODAY = '2026-11-10';

const tokens = createAccessTokens(testConfig.auth.jwtSecret);

describe.skipIf(noTestDatabase)('POST /search against Postgres', () => {
  const db = useTestTransaction();
  let ownerId: string;
  let farmerId: string;
  let tomatoesId: string;
  let categories: Map<string, string>;

  beforeEach(async () => {
    ownerId = await insertTestUser(db(), 'provider');
    farmerId = await insertTestUser(db(), 'farmer');
    tomatoesId = await cropIdByName(db(), 'Tomatoes');
    categories = await categoryIdsBySlug(db());
    await setConfig(db(), 'search_default_radius_km', 25);
    await setConfig(db(), 'search_max_radius_km', 100);
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

  function vegetables(): string {
    return categories.get('vegetables') ?? '';
  }

  function provider(km: number, overrides: Partial<SearchProviderFixture> = {}) {
    return insertSearchProvider(db(), {
      ownerId,
      location: northOf(origin, km),
      categoryIds: [vegetables()],
      ...overrides,
    });
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    ...origin,
    crop_id: tomatoesId,
    quantity: 20,
    capacity_unit: 'crates',
    days: 14,
    ...overrides,
  });

  async function search(
    overrides: Record<string, unknown> = {},
    token?: string,
  ): Promise<SearchResponse> {
    const call = request(app()).post('/api/v1/search');
    if (token !== undefined) call.set('Authorization', `Bearer ${token}`);
    const response = await call.send(body(overrides));
    expect(response.status).toBe(200);
    return searchResponseSchema.parse(response.body);
  }

  const foundIds = (response: SearchResponse) => response.data.map((result) => result.provider.id);

  function searchLogs() {
    return db()
      .selectFrom('search_logs')
      .selectAll()
      .where('lat', '=', origin.lat)
      .where('lng', '=', origin.lng)
      .execute();
  }

  it('returns distance, availability, price, deposit, rating and facility type', async () => {
    const id = await provider(2, {
      facilityType: 'chest_freezer',
      capacityTotal: 100,
      pricePerUnitPerDayKobo: 45_000,
      avgRating: 4.5,
    });
    await insertOccupancy(db(), {
      providerId: id,
      farmerId,
      cropId: tomatoesId,
      quantity: 30,
      startDate: '2026-11-12',
      days: 5,
    });

    const response = await search();

    const config = await db().selectFrom('app_config').select(['key', 'value']).execute();
    const value = (key: string) => config.find((row) => row.key === key)?.value as number;
    const pricing = calculatePricing({
      quantity: 20,
      duration_days: 14,
      unit_price_kobo: 45_000,
      commission_rate: value('commission_rate'),
      deposit_percent: value('deposit_percent'),
      service_fee_kobo: value('service_fee_kobo'),
    });
    expect(response).toMatchObject({
      expanded_radius: false,
      radius_km: 25,
      start_date: TODAY,
      end_date: '2026-11-24',
    });
    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toMatchObject({
      distance_km: 2,
      available_quantity: 70,
      storage_subtotal_kobo: pricing.storage_subtotal_kobo,
      service_fee_kobo: pricing.service_fee_kobo,
      total_estimate_kobo: pricing.storage_subtotal_kobo + pricing.service_fee_kobo,
      deposit_kobo: pricing.deposit_kobo,
      provider: { id, facility_type: 'chest_freezer', avg_rating: 4.5 },
    });
  });

  it('never shows phone numbers or owner fields', async () => {
    await provider(2);
    const response = await request(app()).post('/api/v1/search').send(body());
    const [result] = (response.body as { data: { provider: Record<string, unknown> }[] }).data;
    for (const field of ['phone', 'whatsapp', 'owner_user_id', 'verification_status']) {
      expect(result?.provider).not.toHaveProperty(field);
    }
  });

  it('ranks by distance, then by rating', async () => {
    const far = await provider(9, { avgRating: 5 });
    const nearLow = await provider(3, { avgRating: 2 });
    const nearHigh = await provider(3, { avgRating: 4.8 });
    const nearest = await provider(1, { avgRating: 0 });
    expect(foundIds(await search())).toEqual([nearest, nearHigh, nearLow, far]);
  });

  describe('hard filters', () => {
    it('shows only approved providers while approval is required', async () => {
      const approved = await provider(2);
      await provider(3, { verificationStatus: 'pending' });
      await provider(4, { verificationStatus: 'suspended' });
      await provider(5, { verificationStatus: 'rejected' });
      expect(foundIds(await search())).toEqual([approved]);
    });

    it('also shows pending providers when approval is not required, never suspended or rejected', async () => {
      await setConfig(db(), 'require_provider_approval', false);
      const approved = await provider(2);
      const pending = await provider(3, { verificationStatus: 'pending' });
      await provider(4, { verificationStatus: 'suspended' });
      await provider(5, { verificationStatus: 'rejected' });
      expect(foundIds(await search())).toEqual([approved, pending]);
    });

    it('hides providers that have paused bookings', async () => {
      const open = await provider(2);
      await provider(3, { isAcceptingBookings: false });
      expect(foundIds(await search())).toEqual([open]);
    });

    it("hides providers that do not store the crop's category", async () => {
      const vegetableStore = await provider(2);
      await provider(3, { categoryIds: [categories.get('fish') ?? ''] });
      const mixed = await provider(4, {
        categoryIds: [categories.get('dairy') ?? '', vegetables()],
      });
      expect(foundIds(await search())).toEqual([vegetableStore, mixed]);
    });

    it('hides providers listed in another capacity unit', async () => {
      const crates = await provider(2);
      const kg = await provider(3, { capacityUnit: 'kg' });
      expect(foundIds(await search())).toEqual([crates]);
      expect(foundIds(await search({ capacity_unit: 'kg' }))).toEqual([kg]);
    });

    it('hides providers without enough space on any day of the period', async () => {
      const busyLastDay = await provider(2, { capacityTotal: 100 });
      const busyAfter = await provider(3, { capacityTotal: 100 });
      const exactlyEnough = await provider(4, { capacityTotal: 100 });
      const occupy = (providerId: string, quantity: number, startDate: string, days: number) =>
        insertOccupancy(db(), {
          providerId,
          farmerId,
          cropId: tomatoesId,
          quantity,
          startDate,
          days,
        });
      // The search covers [2026-11-10, 2026-11-24).
      await occupy(busyLastDay, 90, '2026-11-23', 3);
      await occupy(busyAfter, 90, '2026-11-24', 3);
      await occupy(exactlyEnough, 40, '2026-11-10', 14);
      await occupy(exactlyEnough, 40, '2026-11-15', 2);

      const response = await search();

      expect(foundIds(response)).toEqual([busyAfter, exactlyEnough]);
      expect(response.data.map((result) => result.available_quantity)).toEqual([100, 20]);
    });

    it('hides providers outside the radius', async () => {
      const inside = await provider(24);
      await provider(26);
      expect(foundIds(await search())).toEqual([inside]);
    });
  });

  describe('expanded radius', () => {
    it('retries at the maximum radius when nothing is within the default', async () => {
      const far = await provider(60);
      const response = await search();
      expect(response).toMatchObject({ expanded_radius: true, radius_km: 100 });
      expect(foundIds(response)).toEqual([far]);
    });

    it('does not widen a search that found something', async () => {
      const near = await provider(10);
      await provider(60);
      const response = await search();
      expect(response).toMatchObject({ expanded_radius: false, radius_km: 25 });
      expect(foundIds(response)).toEqual([near]);
    });

    it('returns an empty list when nothing is within the maximum either', async () => {
      await provider(150);
      const response = await search();
      expect(response).toMatchObject({ data: [], expanded_radius: true, radius_km: 100 });
    });

    it('widens only past filtered-out providers inside the default radius', async () => {
      await provider(5, { isAcceptingBookings: false });
      const far = await provider(40);
      const response = await search();
      expect(response.expanded_radius).toBe(true);
      expect(foundIds(response)).toEqual([far]);
    });
  });

  describe('search logs', () => {
    it('logs an anonymous search with its result count', async () => {
      await provider(2);
      await provider(3);
      await search();
      expect(await searchLogs()).toEqual([
        expect.objectContaining({
          user_id: null,
          crop_id: tomatoesId,
          quantity: 20,
          duration_days: 14,
          result_count: 2,
          expanded_radius: false,
          channel: 'web',
        }),
      ]);
    });

    it('logs a search that found nothing, even at the maximum radius', async () => {
      await search();
      expect(await searchLogs()).toEqual([
        expect.objectContaining({ result_count: 0, expanded_radius: true }),
      ]);
    });

    it('logs an expanded search that found something', async () => {
      await provider(50);
      await search();
      expect(await searchLogs()).toEqual([
        expect.objectContaining({ result_count: 1, expanded_radius: true }),
      ]);
    });

    it('logs the signed-in user', async () => {
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
      await search({}, token);
      expect(await searchLogs()).toEqual([expect.objectContaining({ user_id: farmerId })]);
    });

    it('does not log a request it refuses', async () => {
      const response = await request(app())
        .post('/api/v1/search')
        .send(body({ crop_id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f' }));
      expect(response.status).toBe(400);
      expect(errorResponseSchema.parse(response.body).error.code).toBe('validation_failed');
      expect(await searchLogs()).toEqual([]);
    });
  });

  describe('dates', () => {
    it('starts today in Lagos when no start date is sent, even before 01:00 WAT', async () => {
      const lateEvening = () => new Date('2026-11-10T23:30:00Z');
      const logs = captureLogs();
      const routes = apiRoutes({
        db: db(),
        config: testConfig,
        logger: logs.logger,
        storage: fakePhotoStorage().storage,
        now: lateEvening,
      });
      const response = await request(
        createApp(testConfig, { db: db(), logger: logs.logger, routes }),
      )
        .post('/api/v1/search')
        .send(body({ days: 3 }));
      expect(searchResponseSchema.parse(response.body)).toMatchObject({
        start_date: '2026-11-11',
        end_date: '2026-11-14',
      });
    });

    it('checks availability over a later start date', async () => {
      const id = await provider(2, { capacityTotal: 100 });
      await insertOccupancy(db(), {
        providerId: id,
        farmerId,
        cropId: tomatoesId,
        quantity: 95,
        startDate: '2026-12-01',
        days: 7,
      });
      expect(foundIds(await search())).toEqual([id]);
      expect(foundIds(await search({ start_date: '2026-11-30', days: 2 }))).toEqual([]);
    });
  });
});
