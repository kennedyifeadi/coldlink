import {
  errorResponseSchema,
  otpRequestResponseSchema,
  sessionResponseSchema,
} from '@coldlink/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { hashOtp } from '../auth/otp.js';
import type { NotificationStore } from '../notifications/store.js';
import { appConfigRows, authTestApp, refreshCookie } from '../test/auth.js';
import { stubDatabase, testConfig, type StubRows } from '../test/helpers.js';
import { memoryNotificationStore } from '../test/notifications.js';

const phone = '+2348031234567';
const typedPhone = '0803 123 4567';
const nationalDigits = '8031234567';
const code = '048213';

const user = {
  id: '6f2c1a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  phone,
  coldlink_id: '4820193',
  full_name: null,
  roles: ['farmer'],
  preferred_channel: 'web',
  home_lga: null,
  home_lat: null,
  home_lng: null,
  consented_at: new Date('2026-11-01T09:00:00Z'),
  last_login_at: null,
  is_active: true,
  created_at: new Date('2026-11-01T09:00:00Z'),
};

const liveCode = {
  id: '0b0d6d3e-1a1f-4b8e-9f43-2b5c3a1d9e01',
  code_hash: hashOtp(testConfig.auth.otpPepper, phone, code),
};

function setup(rows: StubRows = {}, options: { devOtp?: boolean; store?: NotificationStore } = {}) {
  const memory = memoryNotificationStore();
  const test = authTestApp({
    db: stubDatabase({ app_config: appConfigRows(), ...rows }),
    config: { ...testConfig, auth: { ...testConfig.auth, devOtp: options.devOtp ?? false } },
    notificationStore: options.store ?? memory.store,
  });
  return { ...test, notifications: memory };
}

function expectError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(errorResponseSchema.parse(response.body).error.code).toBe(code);
}

describe('POST /api/v1/auth/otp/request', () => {
  it('sends a 6-digit code to the normalised number and says when it expires', async () => {
    const test = setup();
    const response = await request(test.app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: typedPhone });
    await test.settle();
    expect(response.status).toBe(200);
    expect(otpRequestResponseSchema.parse(response.body)).toEqual({
      expires_in_seconds: 600,
      resend_after_seconds: 60,
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(test.sent).toEqual([expect.objectContaining({ to: phone, template: 'otp' })]);
    expect(test.lastCode()).toMatch(/^\d{6}$/);
    expect(test.notifications.rows()).toEqual([
      expect.objectContaining({ template: 'otp', payload: { expires_in_minutes: 10 } }),
    ]);
  });

  it('answers the same for a registered and an unregistered number', async () => {
    const registered = setup({ users: [user] });
    const unregistered = setup();
    const first = await request(registered.app).post('/api/v1/auth/otp/request').send({ phone });
    const second = await request(unregistered.app).post('/api/v1/auth/otp/request').send({ phone });
    await Promise.all([registered.settle(), unregistered.settle()]);
    expect(first.status).toBe(second.status);
    expect(first.body).toEqual(second.body);
    expect(Object.keys(first.headers).sort()).toEqual(Object.keys(second.headers).sort());
    expect(registered.sent).toHaveLength(1);
    expect(unregistered.sent).toHaveLength(1);
  });

  it('returns the code as dev_code only when the dev OTP is on', async () => {
    const test = setup({}, { devOtp: true });
    const response = await request(test.app).post('/api/v1/auth/otp/request').send({ phone });
    await test.settle();
    expect(otpRequestResponseSchema.parse(response.body).dev_code).toBe(test.lastCode());
  });

  it('refuses a number that is not a Nigerian mobile number, in plain words', async () => {
    const test = setup();
    const response = await request(test.app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '01 234 5678' });
    expectError(response, 400, 'validation_failed');
    expect(response.body).toMatchObject({
      error: {
        details: [
          {
            location: 'body',
            path: 'phone',
            message: 'Enter a Nigerian mobile number, like 0803 123 4567',
          },
        ],
      },
    });
    expect(test.sent).toEqual([]);
  });

  it('holds a resend with 429 and Retry-After until the cooldown passes', async () => {
    const now = new Date();
    const test = setup({
      otp_codes: [{ created_at: new Date(now.getTime() - 20_000), now }],
    });
    const response = await request(test.app).post('/api/v1/auth/otp/request').send({ phone });
    expectError(response, 429, 'rate_limited');
    expect(response.headers['retry-after']).toBe('40');
    expect(response.body).toMatchObject({ error: { details: { retry_after_seconds: 40 } } });
    await test.settle();
    expect(test.sent).toEqual([]);
  });

  it('still answers, and logs the failure, when the SMS cannot be logged or sent', async () => {
    const failing: NotificationStore = {
      ...memoryNotificationStore().store,
      insert: () => Promise.reject(new Error('connection terminated')),
    };
    const test = setup({}, { store: failing });
    const response = await request(test.app).post('/api/v1/auth/otp/request').send({ phone });
    await test.settle();
    expect(response.status).toBe(200);
    expect(test.logs.output()).toContain('Sending the sign-in code failed');
  });
});

describe('POST /api/v1/auth/otp/verify', () => {
  it('signs a returning user in, with the refresh token in a locked-down cookie', async () => {
    const test = setup({ users: [user], otp_codes: [liveCode] });
    const response = await request(test.app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: typedPhone, code });
    expect(response.status).toBe(200);
    const body = sessionResponseSchema.parse(response.body);
    expect(body).toMatchObject({
      token_type: 'Bearer',
      expires_in: 900,
      is_new_user: false,
      user: { id: user.id, coldlink_id: '4820193', phone_masked: '+234803***4567' },
    });
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/^coldlink_refresh=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(response.text).not.toContain(refreshCookie(response).split('=')[1]);
    expect(response.text).not.toContain(nationalDigits);
  });

  it('uses the configured SameSite', async () => {
    const test = authTestApp({
      db: stubDatabase({ app_config: appConfigRows(), users: [user], otp_codes: [liveCode] }),
      config: { ...testConfig, auth: { ...testConfig.auth, cookieSameSite: 'none' } },
      notificationStore: memoryNotificationStore().store,
    });
    const response = await request(test.app).post('/api/v1/auth/otp/verify').send({ phone, code });
    expect(String(response.headers['set-cookie'])).toContain('SameSite=None');
  });

  it.each([
    ['a wrong code', { users: [user], otp_codes: [liveCode] }, { code: '999999' }],
    ['no live code', { users: [user] }, { code }],
    ['no code sent', { users: [user], otp_codes: [liveCode] }, {}],
    ['an unregistered number with no live code', {}, { code }],
  ])('returns the same otp_invalid error for %s', async (_case, rows, body) => {
    const test = setup(rows);
    const response = await request(test.app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone, ...body });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'otp_invalid',
        message: 'That code is wrong or has expired. Check the SMS or ask for a new code.',
      },
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a deactivated account', async () => {
    const test = setup({ users: [{ ...user, is_active: false }], otp_codes: [liveCode] });
    const response = await request(test.app).post('/api/v1/auth/otp/verify').send({ phone, code });
    expectError(response, 403, 'account_disabled');
  });

  it('asks an existing account with no consent on record to give it', async () => {
    const test = setup({ users: [{ ...user, consented_at: null }], otp_codes: [liveCode] });
    const response = await request(test.app).post('/api/v1/auth/otp/verify').send({ phone, code });
    expectError(response, 400, 'consent_required');
  });

  it('still needs a code for an existing account when otp_required is off', async () => {
    const test = setup({ app_config: appConfigRows({ otp_required: false }), users: [user] });
    const response = await request(test.app).post('/api/v1/auth/otp/verify').send({ phone });
    expectError(response, 400, 'otp_invalid');
  });
});

describe('POST /api/v1/auth/refresh and /logout', () => {
  it('returns 401 and clears the cookie when there is no refresh cookie', async () => {
    const response = await request(setup().app).post('/api/v1/auth/refresh');
    expectError(response, 401, 'unauthorized');
    expect(String(response.headers['set-cookie'])).toMatch(/^coldlink_refresh=;/);
  });

  it('returns 401 for an unknown refresh token', async () => {
    const response = await request(setup().app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'coldlink_refresh=unknown-token');
    expectError(response, 401, 'unauthorized');
  });

  it.each(['/api/v1/auth/refresh', '/api/v1/auth/logout'])(
    'refuses %s from a site outside the CORS allowlist',
    async (path) => {
      const response = await request(setup().app)
        .post(path)
        .set('Origin', 'https://evil.example')
        .set('Cookie', 'coldlink_refresh=some-token');
      expectError(response, 403, 'forbidden');
    },
  );

  it('logs out without a cookie, clearing it anyway', async () => {
    const response = await request(setup().app)
      .post('/api/v1/auth/logout')
      .set('Origin', testConfig.corsOrigins[0] ?? '');
    expect(response.status).toBe(204);
    expect(String(response.headers['set-cookie'])).toMatch(
      /^coldlink_refresh=;.*Path=\/api\/v1\/auth/,
    );
  });

  it('lets the allowlisted web app send the cookie cross-origin', async () => {
    const origin = testConfig.corsOrigins[0] ?? '';
    const response = await request(setup().app)
      .options('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('auth logging', () => {
  it('never logs the code, a token or the full phone number', async () => {
    const test = setup({ users: [user], otp_codes: [liveCode] }, { devOtp: true });
    const requested = await request(test.app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: typedPhone });
    await test.settle();
    const verified = await request(test.app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: typedPhone, code });
    const session = sessionResponseSchema.parse(verified.body);
    const cookie = refreshCookie(verified);
    await request(test.app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.access_token}`);
    await request(test.app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    await request(test.app).post('/api/v1/auth/logout').set('Cookie', cookie);

    const logs = test.logs.output();
    expect(logs).toContain('request completed');
    for (const secret of [
      test.lastCode(),
      String(otpRequestResponseSchema.parse(requested.body).dev_code),
      code,
      session.access_token,
      cookie.split('=')[1] ?? '',
      nationalDigits,
      '803 123 4567',
      testConfig.auth.otpPepper,
      testConfig.auth.jwtSecret,
    ]) {
      expect(logs).not.toContain(secret);
    }
  });
});
