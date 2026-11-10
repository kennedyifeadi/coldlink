import { errorResponseSchema } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAccessTokens, type AccessTokenClaims } from '../auth/tokens.js';
import { stubDatabase, testApp, testConfig } from '../test/helpers.js';
import { optionalAuth, requireAuth, requireRole, signedInUser } from './auth.js';

const userId = '6f2c1a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const user = {
  id: userId,
  phone: '+2348031234567',
  coldlink_id: '4820193',
  full_name: 'Adebayo Ogunleye',
  roles: ['farmer'],
  preferred_channel: 'web',
  home_lga: null,
  home_lat: null,
  home_lng: null,
  consented_at: new Date('2026-11-01T09:00:00Z'),
  last_login_at: new Date('2026-11-06T09:00:00Z'),
  is_active: true,
  created_at: new Date('2026-11-01T09:00:00Z'),
};
const claims: AccessTokenClaims = { sub: userId, roles: ['farmer'], cid: '4820193' };
const tokens = createAccessTokens(testConfig.auth.jwtSecret);

function app(users: object[] = [user]) {
  const db = stubDatabase({ users });
  const router = Router();
  router.get('/private', requireAuth({ db, tokens }), (req, res) => {
    res.json({ id: signedInUser(req).id });
  });
  router.get('/open', optionalAuth({ db, tokens }), (req, res) => {
    res.json({ id: req.user?.id ?? null });
  });
  router.get('/admin', requireAuth({ db, tokens }), requireRole('admin'), (_req, res) => {
    res.json({ ok: true });
  });
  router.get('/staff', requireAuth({ db, tokens }), requireRole('admin', 'farmer'), (_req, res) => {
    res.json({ ok: true });
  });
  return testApp(router, db).app;
}

async function bearer(overrides: Partial<AccessTokenClaims> = {}, now?: () => Date) {
  const signer =
    now === undefined ? tokens : createAccessTokens(testConfig.auth.jwtSecret, { now });
  return `Bearer ${await signer.sign({ ...claims, ...overrides })}`;
}

function expectError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(errorResponseSchema.parse(response.body).error.code).toBe(code);
}

describe('requireAuth', () => {
  it('attaches the signed-in user', async () => {
    const response = await request(app())
      .get('/api/v1/private')
      .set('Authorization', await bearer());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: userId });
  });

  it('returns 401 with a Bearer challenge when no token is sent', async () => {
    const response = await request(app()).get('/api/v1/private');
    expectError(response, 401, 'unauthorized');
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it.each(['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer not a token', 'token-without-scheme'])(
    'returns 401 for the header %j',
    async (header) => {
      expectError(
        await request(app()).get('/api/v1/private').set('Authorization', header),
        401,
        'unauthorized',
      );
    },
  );

  it('returns 401 for an expired token', async () => {
    const issuedLongAgo = () => new Date(Date.now() - 16 * 60 * 1000);
    const response = await request(app())
      .get('/api/v1/private')
      .set('Authorization', await bearer({}, issuedLongAgo));
    expectError(response, 401, 'unauthorized');
  });

  it('returns 401 for a token signed with another secret', async () => {
    const other = await createAccessTokens(`${testConfig.auth.jwtSecret}-other`).sign(claims);
    expectError(
      await request(app()).get('/api/v1/private').set('Authorization', `Bearer ${other}`),
      401,
      'unauthorized',
    );
  });

  it('returns 401 when the user no longer exists or is inactive', async () => {
    const header = await bearer();
    expectError(
      await request(app([])).get('/api/v1/private').set('Authorization', header),
      401,
      'unauthorized',
    );
    expectError(
      await request(app([{ ...user, is_active: false }]))
        .get('/api/v1/private')
        .set('Authorization', header),
      401,
      'unauthorized',
    );
  });
});

describe('optionalAuth', () => {
  it('lets a request with no token through anonymously', async () => {
    const response = await request(app()).get('/api/v1/open');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: null });
  });

  it('attaches the user when a valid token is sent', async () => {
    const response = await request(app())
      .get('/api/v1/open')
      .set('Authorization', await bearer());
    expect(response.body).toEqual({ id: userId });
  });

  it('returns 401 for a token that is sent but no longer valid', async () => {
    const issuedLongAgo = () => new Date(Date.now() - 16 * 60 * 1000);
    const expired = await request(app())
      .get('/api/v1/open')
      .set('Authorization', await bearer({}, issuedLongAgo));
    expectError(expired, 401, 'unauthorized');
    expect(expired.headers['www-authenticate']).toBe('Bearer');
    expectError(
      await request(app()).get('/api/v1/open').set('Authorization', 'Bearer not a token'),
      401,
      'unauthorized',
    );
  });

  it('returns 401 when the token belongs to an inactive user', async () => {
    const response = await request(app([{ ...user, is_active: false }]))
      .get('/api/v1/open')
      .set('Authorization', await bearer());
    expectError(response, 401, 'unauthorized');
  });
});

describe('requireRole', () => {
  it('returns 403 when the user lacks the role', async () => {
    const response = await request(app())
      .get('/api/v1/admin')
      .set('Authorization', await bearer());
    expectError(response, 403, 'forbidden');
  });

  it('lets in a user with any of the roles', async () => {
    const response = await request(app())
      .get('/api/v1/staff')
      .set('Authorization', await bearer());
    expect(response.status).toBe(200);
  });

  it('checks the roles in the database, not the ones in the token', async () => {
    const admin = { ...user, roles: ['farmer', 'admin'] };
    const farmerToken = await bearer({ roles: ['farmer'] });
    expect(
      (
        await request(app([admin]))
          .get('/api/v1/admin')
          .set('Authorization', farmerToken)
      ).status,
    ).toBe(200);
    const adminToken = await bearer({ roles: ['admin'] });
    expectError(
      await request(app()).get('/api/v1/admin').set('Authorization', adminToken),
      403,
      'forbidden',
    );
  });

  it('returns 401 if requireAuth did not run', async () => {
    const router = Router();
    router.get('/unguarded', requireRole('admin'), (_req, res) => {
      res.json({ ok: true });
    });
    expectError(await request(testApp(router).app).get('/api/v1/unguarded'), 401, 'unauthorized');
  });
});
