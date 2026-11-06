import {
  errorResponseSchema,
  sessionResponseSchema,
  userProfileSchema,
  type SessionResponse,
} from '@coldlink/shared';
import { Router } from 'express';
import { sql } from 'kysely';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAccessTokens } from '../auth/tokens.js';
import { createApp } from '../app.js';
import type { Database } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { authTestApp, refreshCookie } from '../test/auth.js';
import { captureLogs, testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';

const phone = '+2348031234567';
const otherPhone = '+2349051234567';

type TestApp = ReturnType<typeof authTestApp>;

async function requestCode(test: TestApp, number = phone): Promise<string> {
  const response = await request(test.app).post('/api/v1/auth/otp/request').send({ phone: number });
  expect(response.status).toBe(200);
  await test.settle();
  return test.lastCode();
}

function verify(test: TestApp, body: Record<string, unknown>) {
  return request(test.app).post('/api/v1/auth/otp/verify').send(body);
}

async function signIn(test: TestApp, number = phone) {
  const code = await requestCode(test, number);
  const response = await verify(test, { phone: number, code, consent: true });
  expect(response.status).toBe(200);
  return { session: sessionResponseSchema.parse(response.body), cookie: refreshCookie(response) };
}

function expectOtpInvalid(response: request.Response) {
  expect(response.status).toBe(400);
  expect(response.body).toEqual({
    error: {
      code: 'otp_invalid',
      message: 'That code is wrong or has expired. Check the SMS or ask for a new code.',
    },
  });
}

function expectError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(errorResponseSchema.parse(response.body).error.code).toBe(code);
}

/** Moves the number's codes back in time, as if they were sent `seconds` earlier. */
async function ageCodes(db: Database, seconds: number, number = phone) {
  await db
    .updateTable('otp_codes')
    .set({ created_at: sql<Date>`created_at - make_interval(secs => ${seconds})` })
    .where('phone', '=', number)
    .execute();
}

async function insertUser(db: Database, values: { consented?: boolean; isActive?: boolean } = {}) {
  return db
    .insertInto('users')
    .values({
      phone,
      coldlink_id: '5551234',
      consented_at: values.consented === false ? null : new Date('2026-11-01T09:00:00Z'),
      is_active: values.isActive ?? true,
    })
    .returning(['id', 'coldlink_id'])
    .executeTakeFirstOrThrow();
}

describe.skipIf(noTestDatabase)('phone OTP sign-in against Postgres', () => {
  const db = useTestTransaction();
  const app = () => authTestApp({ db: db() });

  describe('registration', () => {
    it('creates a farmer with consent on the first verification', async () => {
      const test = app();
      const code = await requestCode(test);
      const response = await verify(test, { phone: '0803 123 4567', code, consent: true });
      expect(response.status).toBe(200);
      const session = sessionResponseSchema.parse(response.body);
      expect(session.is_new_user).toBe(true);
      expect(session.user).toMatchObject({ roles: ['farmer'], phone_masked: '+234803***4567' });
      expect(session.user.coldlink_id).toMatch(/^[1-9]\d{6}$/);

      const user = await db()
        .selectFrom('users')
        .selectAll()
        .where('phone', '=', phone)
        .executeTakeFirstOrThrow();
      expect(user).toMatchObject({ id: session.user.id, roles: ['farmer'], is_active: true });
      expect(user.consented_at).toBeInstanceOf(Date);
      expect(user.last_login_at).toBeInstanceOf(Date);
      const otp = await db()
        .selectFrom('otp_codes')
        .selectAll()
        .where('phone', '=', phone)
        .executeTakeFirstOrThrow();
      expect(otp.consumed_at).toBeInstanceOf(Date);
      expect(otp.code_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(otp.code_hash).not.toContain(code);
    });

    it('refuses a new number without consent, then accepts the same code with it', async () => {
      const test = app();
      const code = await requestCode(test);
      const refused = await verify(test, { phone, code });
      expect(refused.status).toBe(400);
      expect(refused.body).toEqual({
        error: {
          code: 'consent_required',
          message: 'To create your account, agree to the ColdLink privacy notice.',
        },
      });
      expectError(await verify(test, { phone, code, consent: false }), 400, 'consent_required');
      expect(
        await db().selectFrom('users').select('id').where('phone', '=', phone).execute(),
      ).toEqual([]);
      expect((await verify(test, { phone, code, consent: true })).status).toBe(200);
    });

    it('gives each user a different random ColdLink ID', async () => {
      const test = app();
      const first = await signIn(test, phone);
      const second = await signIn(test, otherPhone);
      expect(first.session.user.coldlink_id).not.toBe(second.session.user.coldlink_id);
    });

    it('keeps the OTP out of the notifications log', async () => {
      const test = app();
      const code = await requestCode(test);
      const rows = await db()
        .selectFrom('notifications')
        .select(['template', 'payload', 'status', 'recipient_phone'])
        .execute();
      expect(rows).toEqual([
        {
          template: 'otp',
          payload: { expires_in_minutes: 10 },
          status: 'sent',
          recipient_phone: phone,
        },
      ]);
      expect(JSON.stringify(rows)).not.toContain(code);
    });
  });

  describe('returning users', () => {
    it('signs in an existing user and stamps the login', async () => {
      const existing = await insertUser(db());
      const test = app();
      const code = await requestCode(test);
      const response = await verify(test, { phone, code });
      expect(response.status).toBe(200);
      const session = sessionResponseSchema.parse(response.body);
      expect(session).toMatchObject({ is_new_user: false, user: { id: existing.id } });
      const { last_login_at } = await db()
        .selectFrom('users')
        .select('last_login_at')
        .where('id', '=', existing.id)
        .executeTakeFirstOrThrow();
      expect(last_login_at).toBeInstanceOf(Date);
    });

    it('records consent for an existing account that had none', async () => {
      const existing = await insertUser(db(), { consented: false });
      const test = app();
      const code = await requestCode(test);
      expectError(await verify(test, { phone, code }), 400, 'consent_required');
      const response = await verify(test, { phone, code, consent: true });
      expect(sessionResponseSchema.parse(response.body).user.consented_at).not.toBeNull();
      expect(sessionResponseSchema.parse(response.body).user.id).toBe(existing.id);
    });

    it('refuses an inactive user', async () => {
      await insertUser(db(), { isActive: false });
      const test = app();
      const code = await requestCode(test);
      const response = await verify(test, { phone, code });
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: {
          code: 'account_disabled',
          message: 'This account is turned off. Contact ColdLink support.',
        },
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('bad codes', () => {
    it('gives a wrong, expired, used-up and missing code the same error', async () => {
      const test = app();
      const wrong = await requestCode(test);
      expectOtpInvalid(
        await verify(test, { phone, code: wrong === '111111' ? '222222' : '111111' }),
      );

      await db()
        .updateTable('otp_codes')
        .set({ expires_at: sql<Date>`now() - interval '1 second'` })
        .where('phone', '=', phone)
        .execute();
      expectOtpInvalid(await verify(test, { phone, code: wrong }));

      expectOtpInvalid(await verify(test, { phone: otherPhone, code: '123456' }));
      expectOtpInvalid(await verify(test, { phone }));
    });

    it('kills a code after 5 wrong guesses, even for the right code', async () => {
      const test = app();
      const code = await requestCode(test);
      const wrong = code === '000000' ? '000001' : '000000';
      for (let guess = 0; guess < 5; guess += 1) {
        expectOtpInvalid(await verify(test, { phone, code: wrong, consent: true }));
      }
      const { attempts } = await db()
        .selectFrom('otp_codes')
        .select('attempts')
        .where('phone', '=', phone)
        .executeTakeFirstOrThrow();
      expect(attempts).toBe(5);
      expectOtpInvalid(await verify(test, { phone, code, consent: true }));
    });

    it('accepts a code once only', async () => {
      const test = app();
      const code = await requestCode(test);
      expect((await verify(test, { phone, code, consent: true })).status).toBe(200);
      expectOtpInvalid(await verify(test, { phone, code, consent: true }));
    });

    it('invalidates the earlier code when a new one is sent', async () => {
      const test = app();
      const first = await requestCode(test);
      await ageCodes(db(), 61);
      const second = await requestCode(test);
      if (first !== second)
        expectOtpInvalid(await verify(test, { phone, code: first, consent: true }));
      expect((await verify(test, { phone, code: second, consent: true })).status).toBe(200);
    });
  });

  describe('rate limits', () => {
    it('holds a resend for 60 seconds per number', async () => {
      const test = app();
      await requestCode(test);
      const held = await request(test.app).post('/api/v1/auth/otp/request').send({ phone });
      expectError(held, 429, 'rate_limited');
      expect(Number(held.headers['retry-after'])).toBeGreaterThan(55);
      expect(Number(held.headers['retry-after'])).toBeLessThanOrEqual(60);
      expect(
        (await request(test.app).post('/api/v1/auth/otp/request').send({ phone: otherPhone }))
          .status,
      ).toBe(200);
      await test.settle();
      expect(test.sent).toHaveLength(2);
    });

    it('allows 5 codes an hour per number', async () => {
      const test = app();
      for (let sent = 0; sent < 5; sent += 1) {
        await requestCode(test);
        await ageCodes(db(), 61);
      }
      expectError(
        await request(test.app).post('/api/v1/auth/otp/request').send({ phone }),
        429,
        'rate_limited',
      );
      await ageCodes(db(), 3600);
      await requestCode(test);
    });

    it('allows 10 codes a day per number', async () => {
      const test = app();
      for (let sent = 0; sent < 10; sent += 1) {
        await requestCode(test);
        await ageCodes(db(), 3601);
      }
      const held = await request(test.app).post('/api/v1/auth/otp/request').send({ phone });
      expectError(held, 429, 'rate_limited');
      expect(Number(held.headers['retry-after'])).toBeGreaterThan(3600);
    });

    it('limits code requests per IP across numbers', async () => {
      const test = authTestApp({
        db: db(),
        authIpLimits: {
          request: { windowMs: 60_000, limit: 2 },
          verify: { windowMs: 60_000, limit: 2 },
          session: { windowMs: 60_000, limit: 2 },
        },
      });
      await requestCode(test, phone);
      await requestCode(test, otherPhone);
      const limited = await request(test.app)
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+2347031234567' });
      expectError(limited, 429, 'rate_limited');
      expect(limited.headers['retry-after']).toBeDefined();
      await verify(test, { phone, code: '123456' });
      await verify(test, { phone, code: '123456' });
      expectError(await verify(test, { phone, code: '123456' }), 429, 'rate_limited');
    });
  });

  describe('sessions', () => {
    it('rotates the refresh token, and a reused old token revokes the family', async () => {
      const test = app();
      const { cookie: first } = await signIn(test);

      const refreshed = await request(test.app).post('/api/v1/auth/refresh').set('Cookie', first);
      expect(refreshed.status).toBe(200);
      const session = sessionResponseSchema.parse(refreshed.body);
      expect(session.is_new_user).toBe(false);
      const second = refreshCookie(refreshed);
      expect(second).not.toBe(first);

      const tokens = await db().selectFrom('refresh_tokens').selectAll().execute();
      expect(tokens).toHaveLength(2);
      expect(new Set(tokens.map((token) => token.family_id)).size).toBe(1);
      const original = tokens.find((token) => token.rotated_from_id === null);
      expect(tokens.find((token) => token.rotated_from_id !== null)?.rotated_from_id).toBe(
        original?.id,
      );
      expect(JSON.stringify(tokens)).not.toContain(first.split('=')[1]);

      const reused = await request(test.app).post('/api/v1/auth/refresh').set('Cookie', first);
      expectError(reused, 401, 'unauthorized');
      expect(test.logs.output()).toContain('Refresh token reused');
      expectError(
        await request(test.app).post('/api/v1/auth/refresh').set('Cookie', second),
        401,
        'unauthorized',
      );
      const live = await db()
        .selectFrom('refresh_tokens')
        .select('id')
        .where('revoked_at', 'is', null)
        .execute();
      expect(live).toEqual([]);
    });

    it('refuses an expired refresh token', async () => {
      const test = app();
      const { cookie } = await signIn(test);
      // now() is fixed for the test's transaction, so the token is moved into the past instead.
      await db()
        .updateTable('refresh_tokens')
        .set({
          created_at: sql<Date>`now() - interval '31 days'`,
          expires_at: sql<Date>`now() - interval '1 day'`,
        })
        .execute();
      expectError(
        await request(test.app).post('/api/v1/auth/refresh').set('Cookie', cookie),
        401,
        'unauthorized',
      );
    });

    it('logs out: the token is revoked and the cookie cleared', async () => {
      const test = app();
      const { cookie } = await signIn(test);
      const loggedOut = await request(test.app).post('/api/v1/auth/logout').set('Cookie', cookie);
      expect(loggedOut.status).toBe(204);
      expect(String(loggedOut.headers['set-cookie'])).toMatch(/^coldlink_refresh=;/);
      expectError(
        await request(test.app).post('/api/v1/auth/refresh').set('Cookie', cookie),
        401,
        'unauthorized',
      );
      expect(test.logs.output()).not.toContain('Refresh token reused');
    });

    it('stops refreshing once the user is deactivated', async () => {
      const test = app();
      const { session, cookie } = await signIn(test);
      await db()
        .updateTable('users')
        .set({ is_active: false })
        .where('id', '=', session.user.id)
        .execute();
      expectError(
        await request(test.app).post('/api/v1/auth/refresh').set('Cookie', cookie),
        403,
        'account_disabled',
      );
      expectError(
        await request(test.app)
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${session.access_token}`),
        401,
        'unauthorized',
      );
    });
  });

  describe('/me', () => {
    function bearer(session: SessionResponse) {
      return `Bearer ${session.access_token}`;
    }

    it('returns the signed-in user without the full phone number', async () => {
      const test = app();
      const { session } = await signIn(test);
      const response = await request(test.app)
        .get('/api/v1/me')
        .set('Authorization', bearer(session));
      expect(response.status).toBe(200);
      expect(userProfileSchema.parse(response.body)).toEqual(session.user);
      expect(response.text).not.toContain('8031234567');
    });

    it('needs a valid access token', async () => {
      const test = app();
      expectError(await request(test.app).get('/api/v1/me'), 401, 'unauthorized');
      expectError(
        await request(test.app).get('/api/v1/me').set('Authorization', 'Bearer abc.def.ghi'),
        401,
        'unauthorized',
      );
    });

    it('updates the profile', async () => {
      const test = app();
      const { session } = await signIn(test);
      const response = await request(test.app)
        .patch('/api/v1/me')
        .set('Authorization', bearer(session))
        .send({
          full_name: '  Adebayo Ogunleye ',
          preferred_channel: 'whatsapp',
          home_lga: 'Ibadan North',
          home_lat: 7.4352,
          home_lng: 3.9133,
        });
      expect(response.status).toBe(200);
      expect(userProfileSchema.parse(response.body)).toMatchObject({
        full_name: 'Adebayo Ogunleye',
        preferred_channel: 'whatsapp',
        home_lga: 'Ibadan North',
        home_lat: 7.4352,
        home_lng: 3.9133,
      });
      const cleared = await request(test.app)
        .patch('/api/v1/me')
        .set('Authorization', bearer(session))
        .send({ home_lat: null, home_lng: null, full_name: null });
      expect(userProfileSchema.parse(cleared.body)).toMatchObject({
        full_name: null,
        home_lat: null,
        home_lng: null,
        home_lga: 'Ibadan North',
      });
    });

    it.each([
      ['a latitude without a longitude', { home_lat: 7.4 }],
      ['one coordinate cleared', { home_lat: null, home_lng: 3.9 }],
      ['nothing to change', {}],
      ['roles', { roles: ['admin'] }],
      ['the phone number', { phone: '+2348099999999' }],
      ['an unknown channel', { preferred_channel: 'email' }],
      ['an empty name', { full_name: '   ' }],
    ])('refuses %s', async (_case, body) => {
      const test = app();
      const { session } = await signIn(test);
      expectError(
        await request(test.app)
          .patch('/api/v1/me')
          .set('Authorization', bearer(session))
          .send(body),
        400,
        'validation_failed',
      );
      const { roles } = await db()
        .selectFrom('users')
        .select('roles')
        .where('id', '=', session.user.id)
        .executeTakeFirstOrThrow();
      expect(roles).toEqual(['farmer']);
    });
  });

  describe('roles', () => {
    it('lets in only users with the role, read fresh from the database', async () => {
      const test = app();
      const { session } = await signIn(test);
      const router = Router();
      const deps = { db: db(), tokens: createAccessTokens(testConfig.auth.jwtSecret) };
      router.get('/admin-only', requireAuth(deps), requireRole('admin'), (_req, res) => {
        res.json({ ok: true });
      });
      const guarded = createApp(testConfig, {
        db: db(),
        logger: captureLogs().logger,
        routes: router,
      });
      const header = `Bearer ${session.access_token}`;
      expectError(
        await request(guarded).get('/api/v1/admin-only').set('Authorization', header),
        403,
        'forbidden',
      );
      await db()
        .updateTable('users')
        .set({ roles: ['farmer', 'admin'] })
        .where('id', '=', session.user.id)
        .execute();
      expect(
        (await request(guarded).get('/api/v1/admin-only').set('Authorization', header)).status,
      ).toBe(200);
    });
  });

  describe('otp_required', () => {
    async function setOtpRequired(value: boolean) {
      await db()
        .updateTable('app_config')
        .set({ value: JSON.stringify(value) })
        .where('key', '=', 'otp_required')
        .execute();
    }

    it('on (the default): a new number cannot register without a code', async () => {
      expectOtpInvalid(await verify(app(), { phone, consent: true }));
    });

    it('off: a new number registers without a code, with consent', async () => {
      await setOtpRequired(false);
      const test = app();
      expectError(await verify(test, { phone }), 400, 'consent_required');
      const response = await verify(test, { phone, consent: true });
      expect(response.status).toBe(200);
      expect(sessionResponseSchema.parse(response.body).is_new_user).toBe(true);
      expect(test.logs.output()).toContain('Account created without an OTP');
    });

    it('off: an existing account still needs its code', async () => {
      await insertUser(db());
      await setOtpRequired(false);
      const test = app();
      expectOtpInvalid(await verify(test, { phone, consent: true }));
      const code = await requestCode(test);
      expect((await verify(test, { phone, code })).status).toBe(200);
    });
  });

  it('never logs a code, a token or the full phone number', async () => {
    const test = app();
    const { session, cookie } = await signIn(test);
    const code = test.lastCode();
    await request(test.app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.access_token}`);
    const refreshed = await request(test.app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    await request(test.app).post('/api/v1/auth/logout').set('Cookie', refreshCookie(refreshed));
    const logs = test.logs.output();
    for (const secret of [
      code,
      session.access_token,
      cookie.split('=')[1] ?? '',
      refreshCookie(refreshed).split('=')[1] ?? '',
      '8031234567',
    ]) {
      expect(logs).not.toContain(secret);
    }
  });
});
