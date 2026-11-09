import { randomInt } from 'node:crypto';
import {
  errorResponseSchema,
  MAX_PROVIDER_PHOTO_BYTES,
  ownProviderSchema,
  ownProvidersResponseSchema,
  publicProviderSchema,
  userProfileSchema,
  type UserRole,
} from '@coldlink/shared';
import { sql } from 'kysely';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import type { Database } from '../db/client.js';
import { appendPhoto } from '../providers/store.js';
import { insertBooking } from '../test/bookings.js';
import { captureLogs, testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { fakePhotoStorage, FAKE_STORAGE_ORIGIN } from '../test/storage.js';
import { apiRoutes } from './index.js';

const tokens = createAccessTokens(testConfig.auth.jwtSecret);

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

interface TestUser {
  id: string;
  phone: string;
  token: string;
}

// +234 800 is the toll-free range, so no SMS could reach a real person; 7 keeps clear of the dev
// seed's owners and the booking fixtures.
function testPhone(): string {
  return `+2348007${randomInt(100_000, 1_000_000)}`;
}

async function insertUser(db: Database, roles: UserRole[]): Promise<TestUser> {
  const user = await db
    .insertInto('users')
    .values({ phone: testPhone(), coldlink_id: `${randomInt(1_000_000, 10_000_000)}`, roles })
    .returning(['id', 'phone', 'coldlink_id', 'roles'])
    .executeTakeFirstOrThrow();
  return { ...user, token: await bearer(user) };
}

function bearer(user: { id: string; coldlink_id: string; roles: string[] }): Promise<string> {
  return tokens.sign({ sub: user.id, cid: user.coldlink_id, roles: user.roles as UserRole[] });
}

async function categoryIds(db: Database, ...slugs: string[]): Promise<string[]> {
  const rows = await db
    .selectFrom('crop_categories')
    .select(['id', 'slug'])
    .where('slug', 'in', slugs)
    .execute();
  return slugs.map((slug) => rows.find((row) => row.slug === slug)?.id ?? '');
}

async function setApproval(db: Database, required: boolean) {
  await db
    .updateTable('app_config')
    .set({ value: sql`${JSON.stringify(required)}::jsonb` })
    .where('key', '=', 'require_provider_approval')
    .execute();
}

function expectError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(errorResponseSchema.parse(response.body).error.code).toBe(code);
}

describe.skipIf(noTestDatabase)('provider endpoints against Postgres', () => {
  const db = useTestTransaction();

  function setup() {
    const logs = captureLogs();
    const photos = fakePhotoStorage();
    const routes = apiRoutes({
      db: db(),
      config: testConfig,
      logger: logs.logger,
      storage: photos.storage,
    });
    const app = createApp(testConfig, { db: db(), logger: logs.logger, routes });
    return { app, logs, objects: photos.objects };
  }

  async function newProviderBody(overrides: Record<string, unknown> = {}) {
    return {
      display_name: 'Bodija Cold Room',
      facility_type: 'cold_room',
      address_text: '12 Bodija Market Road',
      lga: 'Ibadan North',
      lat: 7.4352,
      lng: 3.9133,
      capacity_total: 40,
      capacity_unit: 'sqm',
      price_per_unit_per_day_kobo: 225_800,
      category_ids: await categoryIds(db(), 'vegetables', 'fruits'),
      ...overrides,
    };
  }

  type App = ReturnType<typeof setup>['app'];

  async function createProvider(app: App, user: TestUser, overrides: Record<string, unknown> = {}) {
    const response = await request(app)
      .post('/api/v1/providers')
      .set('Authorization', `Bearer ${user.token}`)
      .send(await newProviderBody(overrides));
    expect(response.status).toBe(201);
    return ownProviderSchema.parse(response.body);
  }

  function patch(app: App, user: TestUser, id: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/v1/providers/${id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(body);
  }

  function upload(app: App, user: TestUser, id: string, body: Buffer, type = 'image/jpeg') {
    return request(app)
      .post(`/api/v1/providers/${id}/photos`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('Content-Type', type)
      .send(body);
  }

  describe('POST /providers', () => {
    it('creates a pending provider and gives the user the provider role', async () => {
      const { app } = setup();
      const farmer = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, farmer);

      expect(provider).toMatchObject({
        display_name: 'Bodija Cold Room',
        verification_status: 'pending',
        verified_at: null,
        lat: 7.4352,
        lng: 3.9133,
        capacity_total: 40,
        price_per_unit_per_day_kobo: 225_800,
        min_storage_days: 1,
        has_backup_power: 'unknown',
        is_accepting_bookings: true,
        photos: [],
        phone_masked: `${farmer.phone.slice(0, 7)}***${farmer.phone.slice(-4)}`,
        whatsapp_masked: null,
      });
      expect(provider.categories.map((category) => category.slug).toSorted()).toEqual([
        'fruits',
        'vegetables',
      ]);

      const row = await db()
        .selectFrom('providers')
        .select(['owner_user_id', 'phone'])
        .where('id', '=', provider.id)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ owner_user_id: farmer.id, phone: farmer.phone });

      const me = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${farmer.token}`);
      expect(userProfileSchema.parse(me.body).roles).toEqual(['farmer', 'provider']);
    });

    it('stores a different notification number when one is given', async () => {
      const { app } = setup();
      const farmer = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, farmer, {
        phone: '0803 123 4567',
        whatsapp: '0905 123 4567',
      });
      expect(provider).toMatchObject({
        phone_masked: '+234803***4567',
        whatsapp_masked: '+234905***4567',
      });
    });

    it('keeps a pending provider out of the public view', async () => {
      const { app } = setup();
      const provider = await createProvider(app, await insertUser(db(), ['farmer']));
      expectError(await request(app).get(`/api/v1/providers/${provider.id}`), 404, 'not_found');
    });

    it('puts the provider live at once when approval is not required', async () => {
      await setApproval(db(), false);
      const { app } = setup();
      const provider = await createProvider(app, await insertUser(db(), ['farmer']));
      expect(provider).toMatchObject({ verification_status: 'approved', verified_at: null });
      const response = await request(app).get(`/api/v1/providers/${provider.id}`);
      expect(response.status).toBe(200);
    });

    it('does not add the provider role twice', async () => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer', 'provider']);
      await createProvider(app, owner);
      await createProvider(app, owner);
      const { roles } = await db()
        .selectFrom('users')
        .select('roles')
        .where('id', '=', owner.id)
        .executeTakeFirstOrThrow();
      expect(roles).toEqual(['farmer', 'provider']);
    });

    it('refuses an unknown crop category', async () => {
      const { app } = setup();
      const farmer = await insertUser(db(), ['farmer']);
      const response = await request(app)
        .post('/api/v1/providers')
        .set('Authorization', `Bearer ${farmer.token}`)
        .send(await newProviderBody({ category_ids: ['6f1c1a8e-0c4b-4f5e-9a3d-2b7e8c9d0a1f'] }));
      expectError(response, 400, 'validation_failed');
      expect(response.body).toMatchObject({ error: { details: [{ path: 'category_ids' }] } });
      const count = await db()
        .selectFrom('providers')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('owner_user_id', '=', farmer.id)
        .executeTakeFirstOrThrow();
      expect(Number(count.count)).toBe(0);
    });

    it('needs a signed-in user', async () => {
      const { app } = setup();
      const response = await request(app)
        .post('/api/v1/providers')
        .send(await newProviderBody());
      expectError(response, 401, 'unauthorized');
    });
  });

  describe('GET /providers/:id', () => {
    it('shows an approved provider without phone numbers or owner fields', async () => {
      await setApproval(db(), false);
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner, { whatsapp: '0905 123 4567' });

      const response = await request(app).get(`/api/v1/providers/${provider.id}`);
      expect(response.status).toBe(200);
      const body = publicProviderSchema.parse(response.body);
      expect(body.display_name).toBe('Bodija Cold Room');
      const text = JSON.stringify(response.body);
      expect(text).not.toContain('+234');
      expect(text).not.toContain(owner.id);
    });

    it.each(['suspended', 'rejected'])('hides a %s provider', async (status) => {
      await setApproval(db(), false);
      const { app } = setup();
      const provider = await createProvider(app, await insertUser(db(), ['farmer']));
      await db()
        .updateTable('providers')
        .set({ verification_status: status })
        .where('id', '=', provider.id)
        .execute();
      expectError(await request(app).get(`/api/v1/providers/${provider.id}`), 404, 'not_found');
    });

    it('answers 404 for an unknown id and 400 for a malformed one', async () => {
      const { app } = setup();
      expectError(
        await request(app).get('/api/v1/providers/6f1c1a8e-0c4b-4f5e-9a3d-2b7e8c9d0a1f'),
        404,
        'not_found',
      );
      expectError(await request(app).get('/api/v1/providers/abc'), 400, 'validation_failed');
    });
  });

  describe('GET /providers/mine', () => {
    it("lists only the signed-in user's providers, in any status", async () => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const first = await createProvider(app, owner);
      const second = await createProvider(app, owner, { display_name: 'Second room' });
      await createProvider(app, await insertUser(db(), ['farmer']));

      const response = await request(app)
        .get('/api/v1/providers/mine')
        .set('Authorization', `Bearer ${owner.token}`);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { data } = ownProvidersResponseSchema.parse(response.body);
      expect(data.map((provider) => provider.id)).toEqual([first.id, second.id]);
    });

    it('refuses a user without the provider role', async () => {
      const { app } = setup();
      const farmer = await insertUser(db(), ['farmer']);
      const response = await request(app)
        .get('/api/v1/providers/mine')
        .set('Authorization', `Bearer ${farmer.token}`);
      expectError(response, 403, 'forbidden');
    });
  });

  describe('PATCH /providers/:id', () => {
    it('lets the owner change capacity, price, pausing and categories', async () => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      const [tubers] = await categoryIds(db(), 'tubers');

      const response = await patch(app, owner, provider.id, {
        capacity_total: 55.5,
        price_per_unit_per_day_kobo: 250_000,
        is_accepting_bookings: false,
        category_ids: [tubers],
        description: 'Solar backed cold room',
      });
      expect(response.status).toBe(200);
      const updated = ownProviderSchema.parse(response.body);
      expect(updated).toMatchObject({
        capacity_total: 55.5,
        price_per_unit_per_day_kobo: 250_000,
        is_accepting_bookings: false,
        description: 'Solar backed cold room',
        display_name: 'Bodija Cold Room',
        verification_status: 'pending',
      });
      expect(updated.categories.map((category) => category.slug)).toEqual(['tubers']);
    });

    it('moves the location when lat and lng are sent', async () => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      const response = await patch(app, owner, provider.id, { lat: 7.3775, lng: 3.947 });
      expect(ownProviderSchema.parse(response.body)).toMatchObject({ lat: 7.3775, lng: 3.947 });
    });

    it('checks a temperature change against the stored one', async () => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner, { temp_min_c: 2, temp_max_c: 8 });
      const response = await patch(app, owner, provider.id, { temp_min_c: 10 });
      expectError(response, 400, 'validation_failed');
      expect(response.body).toMatchObject({ error: { details: [{ path: 'temp_max_c' }] } });
    });

    it('refuses another provider', async () => {
      const { app } = setup();
      const provider = await createProvider(app, await insertUser(db(), ['farmer']));
      const other = await insertUser(db(), ['provider']);
      expectError(
        await patch(app, other, provider.id, { price_per_unit_per_day_kobo: 1 }),
        403,
        'forbidden',
      );
      const row = await db()
        .selectFrom('providers')
        .select('price_per_unit_per_day_kobo')
        .where('id', '=', provider.id)
        .executeTakeFirstOrThrow();
      expect(row.price_per_unit_per_day_kobo).toBe(225_800);
    });

    it('refuses a farmer who is not a provider', async () => {
      const { app } = setup();
      const provider = await createProvider(app, await insertUser(db(), ['farmer']));
      const farmer = await insertUser(db(), ['farmer']);
      expectError(await patch(app, farmer, provider.id, { lga: 'Akinyele' }), 403, 'forbidden');
    });

    it('lets an admin edit any provider', async () => {
      const { app } = setup();
      const provider = await createProvider(app, await insertUser(db(), ['farmer']));
      const admin = await insertUser(db(), ['admin']);
      const response = await patch(app, admin, provider.id, { lga: 'Akinyele' });
      expect(response.status).toBe(200);
      expect(ownProviderSchema.parse(response.body).lga).toBe('Akinyele');
    });

    it('answers 404 for an unknown provider', async () => {
      const { app } = setup();
      const admin = await insertUser(db(), ['admin']);
      expectError(
        await patch(app, admin, '6f1c1a8e-0c4b-4f5e-9a3d-2b7e8c9d0a1f', { lga: 'Akinyele' }),
        404,
        'not_found',
      );
    });

    it('refuses moderation fields', async () => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      expectError(
        await patch(app, owner, provider.id, { verification_status: 'approved' }),
        400,
        'validation_failed',
      );
    });

    it("leaves an existing booking's prices unchanged when the price changes", async () => {
      const { app } = setup();
      const fixture = await insertBooking(db(), 'confirmed');
      const owner = await db()
        .selectFrom('users')
        .select(['id', 'phone', 'coldlink_id', 'roles'])
        .where('id', '=', fixture.ownerId)
        .executeTakeFirstOrThrow();
      const ownerUser = { ...owner, token: await bearer(owner) };
      const amounts = () =>
        db()
          .selectFrom('bookings')
          .select([
            'unit_price_kobo',
            'storage_subtotal_kobo',
            'commission_kobo',
            'deposit_kobo',
            'balance_due_kobo',
            'total_charged_online_kobo',
          ])
          .where('id', '=', fixture.bookingId)
          .executeTakeFirstOrThrow();
      const before = await amounts();

      const response = await patch(app, ownerUser, fixture.providerId, {
        price_per_unit_per_day_kobo: 500_000,
      });
      expect(response.status).toBe(200);
      expect(ownProviderSchema.parse(response.body).price_per_unit_per_day_kobo).toBe(500_000);

      expect(await amounts()).toEqual(before);
      expect(before.unit_price_kobo).toBe(225_800);
    });
  });

  describe('photos', () => {
    it('stores a photo and lists it with its public URL', async () => {
      const { app, objects } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);

      const response = await upload(app, owner, provider.id, JPEG);
      expect(response.status).toBe(201);
      const { photos } = ownProviderSchema.parse(response.body);
      expect(photos).toHaveLength(1);
      const [photo] = photos;
      expect(photo?.id).toMatch(/\.jpg$/);
      const path = `providers/${provider.id}/${photo?.id}`;
      expect(photo?.url).toBe(`${FAKE_STORAGE_ORIGIN}/${path}`);
      expect(objects.get(path)).toEqual({ body: JPEG, contentType: 'image/jpeg' });
    });

    it.each([
      ['PNG', PNG, 'image/png', 'png'],
      ['WebP', WEBP, 'image/webp', 'webp'],
    ])('accepts a %s photo', async (_name, body, type, extension) => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      const response = await upload(app, owner, provider.id, body, type);
      expect(response.status).toBe(201);
      expect(ownProviderSchema.parse(response.body).photos[0]?.id).toMatch(
        new RegExp(`\\.${extension}$`),
      );
    });

    it('refuses a fifth photo', async () => {
      const { app, objects } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      for (let count = 0; count < 4; count += 1) {
        expect((await upload(app, owner, provider.id, JPEG)).status).toBe(201);
      }
      expectError(await upload(app, owner, provider.id, JPEG), 409, 'conflict');
      expect(objects.size).toBe(4);
    });

    it('never stores a fifth path, even when two uploads race for the last slot', async () => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      for (let count = 0; count < 3; count += 1) {
        await appendPhoto(db(), provider.id, `providers/${provider.id}/${count}.jpg`);
      }
      expect(await appendPhoto(db(), provider.id, `providers/${provider.id}/3.jpg`)).toBe(true);
      expect(await appendPhoto(db(), provider.id, `providers/${provider.id}/4.jpg`)).toBe(false);
    });

    it('refuses a photo over the size limit before storing anything', async () => {
      const { app, objects } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      const tooBig = Buffer.concat([JPEG, Buffer.alloc(MAX_PROVIDER_PHOTO_BYTES)]);
      expectError(await upload(app, owner, provider.id, tooBig), 413, 'payload_too_large');
      expect(objects.size).toBe(0);
    });

    it('accepts a photo of exactly the size limit', async () => {
      const { app } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      const atLimit = Buffer.concat([JPEG, Buffer.alloc(MAX_PROVIDER_PHOTO_BYTES - JPEG.length)]);
      expect((await upload(app, owner, provider.id, atLimit)).status).toBe(201);
    });

    it.each([
      ['a type that is not allowed', JPEG, 'image/gif'],
      ['a file that is not the type it claims', PNG, 'image/jpeg'],
      ['a file that is not an image', Buffer.from('<svg onload="alert(1)"/>'), 'image/png'],
      ['an empty body', Buffer.alloc(0), 'image/jpeg'],
    ])('refuses %s', async (_name, body, type) => {
      const { app, objects } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      expectError(await upload(app, owner, provider.id, body, type), 400, 'bad_request');
      expect(objects.size).toBe(0);
    });

    it('refuses an upload from another provider, and lets an admin upload', async () => {
      const { app, objects } = setup();
      const provider = await createProvider(app, await insertUser(db(), ['farmer']));
      const other = await insertUser(db(), ['provider']);
      expectError(await upload(app, other, provider.id, JPEG), 403, 'forbidden');
      expect(objects.size).toBe(0);
      const admin = await insertUser(db(), ['admin']);
      expect((await upload(app, admin, provider.id, JPEG)).status).toBe(201);
    });

    it('deletes a photo from the provider and from storage', async () => {
      const { app, objects } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      const uploaded = ownProviderSchema.parse((await upload(app, owner, provider.id, JPEG)).body);
      const photoId = uploaded.photos[0]?.id ?? '';

      const response = await request(app)
        .delete(`/api/v1/providers/${provider.id}/photos/${photoId}`)
        .set('Authorization', `Bearer ${owner.token}`);
      expect(response.status).toBe(200);
      expect(ownProviderSchema.parse(response.body).photos).toEqual([]);
      expect(objects.size).toBe(0);

      const again = await request(app)
        .delete(`/api/v1/providers/${provider.id}/photos/${photoId}`)
        .set('Authorization', `Bearer ${owner.token}`);
      expectError(again, 404, 'not_found');
    });

    it("refuses to delete another provider's photo", async () => {
      const { app, objects } = setup();
      const owner = await insertUser(db(), ['farmer']);
      const provider = await createProvider(app, owner);
      const uploaded = ownProviderSchema.parse((await upload(app, owner, provider.id, JPEG)).body);
      const other = await insertUser(db(), ['provider']);
      const response = await request(app)
        .delete(`/api/v1/providers/${provider.id}/photos/${uploaded.photos[0]?.id}`)
        .set('Authorization', `Bearer ${other.token}`);
      expectError(response, 403, 'forbidden');
      expect(objects.size).toBe(1);
    });
  });
});
