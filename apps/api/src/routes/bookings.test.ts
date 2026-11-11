import { errorResponseSchema, validationIssueSchema } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { createApp } from '../app.js';
import type { AppConfigReader } from '../appConfig.js';
import { createAccessTokens } from '../auth/tokens.js';
import { captureLogs, stubDatabase, testConfig } from '../test/helpers.js';
import { bookingRoutes } from './bookings.js';

// Everything here is refused before the facility is read, so a stub database is enough; the quote
// itself is covered against Postgres in bookings.integration.test.ts.

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

function app(limit = 100) {
  const db = stubDatabase();
  const router = Router();
  router.use(
    bookingRoutes({
      db,
      tokens: createAccessTokens(testConfig.auth.jwtSecret),
      appConfig: unusedConfig,
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
