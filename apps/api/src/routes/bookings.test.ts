import { errorResponseSchema, validationIssueSchema, type UserRole } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { createApp } from '../app.js';
import type { AppConfigReader } from '../appConfig.js';
import { createAccessTokens } from '../auth/tokens.js';
import { createTransitionHooks } from '../bookings/hooks.js';
import { captureLogs, stubDatabase, testConfig } from '../test/helpers.js';
import { bookingRoutes } from './bookings.js';

// Everything here is refused before the facility or a booking is read, so a stub database is enough;
// the endpoints themselves are covered against Postgres in bookings.integration.test.ts.

const unusedConfig: AppConfigReader = {
  get: () => Promise.reject(new Error('The config is not read before the request is checked')),
  clear: () => undefined,
};

const body = {
  provider_id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  quantity: 20,
  capacity_unit: 'crates',
  days: 14,
};

// 23:30 UTC on 10 November is already 11 November in Lagos.
const lateEvening = () => new Date('2026-11-10T23:30:00Z');

const tokens = createAccessTokens(testConfig.auth.jwtSecret);

function user(roles: UserRole[]) {
  return {
    id: '6f2c1a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
    phone: '+2348031234567',
    coldlink_id: '4820193',
    full_name: null,
    roles,
    preferred_channel: 'web',
    home_lga: null,
    home_lat: null,
    home_lng: null,
    consented_at: new Date('2026-11-01T09:00:00Z'),
    last_login_at: new Date('2026-11-06T09:00:00Z'),
    is_active: true,
    created_at: new Date('2026-11-01T09:00:00Z'),
  };
}

function bearer(roles: UserRole[]) {
  const { id, coldlink_id } = user(roles);
  return tokens.sign({ sub: id, cid: coldlink_id, roles }).then((token) => `Bearer ${token}`);
}

function app(limit = 100, roles: UserRole[] = ['farmer']) {
  const db = stubDatabase({ users: [user(roles)] });
  const router = Router();
  router.use(
    bookingRoutes({
      db,
      tokens,
      appConfig: unusedConfig,
      hooks: createTransitionHooks(),
      quoteIpLimit: { windowMs: 60_000, limit },
      now: lateEvening,
    }),
  );
  return createApp(testConfig, { db, logger: captureLogs().logger, routes: router });
}

function issues(response: request.Response) {
  expect(response.status).toBe(400);
  const { error } = errorResponseSchema.parse(response.body);
  expect(error.code).toBe('validation_failed');
  return z.array(validationIssueSchema).parse(error.details);
}

describe('POST /bookings/quote', () => {
  it('names every invalid field', async () => {
    const response = await request(app())
      .post('/api/v1/bookings/quote')
      .send({ ...body, provider_id: 'cold-room', quantity: 0, days: 0 });
    expect(
      issues(response)
        .map((issue) => issue.path)
        .toSorted(),
    ).toEqual(['days', 'provider_id', 'quantity']);
  });

  it('refuses part of a crate', async () => {
    const response = await request(app())
      .post('/api/v1/bookings/quote')
      .send({ ...body, quantity: 2.5 });
    expect(issues(response)).toEqual([
      { location: 'body', path: 'quantity', message: 'Crates must be a whole number' },
    ]);
  });

  it('refuses a start date before today in Lagos', async () => {
    const response = await request(app())
      .post('/api/v1/bookings/quote')
      .send({ ...body, start_date: '2026-11-10' });
    expect(issues(response)).toEqual([
      { location: 'body', path: 'start_date', message: 'Choose today or a later date' },
    ]);
  });

  it('returns 401 for an access token that is sent but invalid', async () => {
    const response = await request(app())
      .post('/api/v1/bookings/quote')
      .set('Authorization', 'Bearer not-a-token')
      .send(body);
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('unauthorized');
  });

  it('is rate limited', async () => {
    const limited = app(2);
    const invalid = { ...body, days: 0 };
    expect((await request(limited).post('/api/v1/bookings/quote').send(invalid)).status).toBe(400);
    expect((await request(limited).post('/api/v1/bookings/quote').send(invalid)).status).toBe(400);

    const response = await request(limited).post('/api/v1/bookings/quote').send(body);
    expect(response.status).toBe(429);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('rate_limited');
  });
});

const bookingId = '3c9e2a1b-7d4f-4e8a-b5c6-0d1e2f3a4b5c';
const createBody = { ...body, crop_id: '6d1f0c2a-8e3b-4f5a-9c7d-1b2e3f4a5b6c' };

const farmerCalls: [string, (target: request.Agent) => request.Test][] = [
  ['POST /bookings', (target) => target.post('/api/v1/bookings').send(createBody)],
  ['GET /bookings', (target) => target.get('/api/v1/bookings')],
  ['GET /bookings/:id', (target) => target.get(`/api/v1/bookings/${bookingId}`)],
  ['POST /bookings/:id/cancel', (target) => target.post(`/api/v1/bookings/${bookingId}/cancel`)],
];

describe.each(farmerCalls)('%s', (_name, call) => {
  it('needs a signed-in user', async () => {
    const response = await call(request.agent(app()));
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('unauthorized');
  });

  it('is for farmers only', async () => {
    const agent = request.agent(app(100, ['provider']));
    agent.set('Authorization', await bearer(['provider']));
    const response = await call(agent);
    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('forbidden');
  });
});

describe('farmer booking requests', () => {
  async function farmer() {
    const agent = request.agent(app());
    agent.set('Authorization', await bearer(['farmer']));
    return agent;
  }

  it('needs a crop to book', async () => {
    const response = await (await farmer()).post('/api/v1/bookings').send(body);
    expect(issues(response).map((issue) => issue.path)).toEqual(['crop_id']);
  });

  it('refuses part of a crate when booking', async () => {
    const response = await (
      await farmer()
    )
      .post('/api/v1/bookings')
      .send({ ...createBody, quantity: 2.5 });
    expect(issues(response).map((issue) => issue.path)).toEqual(['quantity']);
  });

  it('refuses a booking start date before today in Lagos', async () => {
    const response = await (
      await farmer()
    )
      .post('/api/v1/bookings')
      .send({ ...createBody, start_date: '2026-11-10' });
    expect(issues(response).map((issue) => issue.path)).toEqual(['start_date']);
  });

  it('refuses a booking id that is not a uuid', async () => {
    const response = await (await farmer()).get('/api/v1/bookings/CL-7K3Q9');
    expect(issues(response)).toMatchObject([{ location: 'params', path: 'id' }]);
  });

  it('refuses an empty cancellation reason', async () => {
    const response = await (
      await farmer()
    )
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .send({ reason: '  ' });
    expect(issues(response).map((issue) => issue.path)).toEqual(['reason']);
  });
});
