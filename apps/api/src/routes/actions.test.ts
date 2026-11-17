import { errorResponseSchema } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTransitionHooks } from '../bookings/hooks.js';
import { captureLogs, stubDatabase, testConfig } from '../test/helpers.js';
import { actionRoutes } from './actions.js';

// The stub database has no tokens, so every link here is unknown; used, expired and wrong-purpose
// links are covered against Postgres in actions.integration.test.ts.

const token = 'Hk3_q-9ZxYv0LmN2pQrStUvWxYz0123456789abcDE';

function app(limit = 100) {
  const db = stubDatabase();
  const router = Router();
  router.use(
    actionRoutes({ db, hooks: createTransitionHooks(), ipLimit: { windowMs: 60_000, limit } }),
  );
  return createApp(testConfig, { db, logger: captureLogs().logger, routes: router });
}

describe('GET /actions/:token', () => {
  it.each([token, 'not-a-token'])('is 404 for the unknown link %s', async (link) => {
    const response = await request(app()).get(`/api/v1/actions/${link}`);
    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(response.body).error).toEqual({
      code: 'not_found',
      message: 'This link has expired or has already been used',
    });
  });

  it('is rate limited per IP', async () => {
    const limited = app(2);
    await request(limited).get(`/api/v1/actions/${token}`);
    await request(limited).get(`/api/v1/actions/${token}`);
    const response = await request(limited).get(`/api/v1/actions/${token}`);
    expect(response.status).toBe(429);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('rate_limited');
  });
});

describe('POST /actions/:token', () => {
  it.each([{}, { action: 'check_in' }, { action: 'accept', reason: 'Full' }])(
    'refuses the body %j before looking at the link',
    async (body) => {
      const response = await request(app()).post(`/api/v1/actions/${token}`).send(body);
      expect(response.status).toBe(400);
      expect(errorResponseSchema.parse(response.body).error.code).toBe('validation_failed');
    },
  );

  it('is 404 for an unknown link', async () => {
    const response = await request(app())
      .post(`/api/v1/actions/${token}`)
      .send({ action: 'accept' });
    expect(response.status).toBe(404);
  });

  it('shares the per-IP limit with GET', async () => {
    const limited = app(2);
    await request(limited).get(`/api/v1/actions/${token}`);
    await request(limited).post(`/api/v1/actions/${token}`).send({ action: 'reject' });
    const response = await request(limited)
      .post(`/api/v1/actions/${token}`)
      .send({ action: 'reject' });
    expect(response.status).toBe(429);
  });
});
