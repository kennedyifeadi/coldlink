import { errorResponseSchema, validationIssueSchema } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { createApp } from '../app.js';
import type { AppConfigReader } from '../appConfig.js';
import { createAccessTokens } from '../auth/tokens.js';
import type { Database } from '../db/client.js';
import { captureLogs, stubDatabase, testConfig } from '../test/helpers.js';
import { fakePhotoStorage } from '../test/storage.js';
import { searchRoutes } from './search.js';

// Everything here is refused before the search query runs, so a stub database is enough; the
// search itself is covered against Postgres in search.integration.test.ts.

const unusedConfig: AppConfigReader = {
  get: () => Promise.reject(new Error('The config is not read before the request is checked')),
  clear: () => undefined,
};

const body = {
  lat: 7.3775,
  lng: 3.947,
  crop_id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  quantity: 20,
  capacity_unit: 'crates',
  days: 14,
};

// 23:30 UTC on 10 November is already 11 November in Lagos.
const lateEvening = () => new Date('2026-11-10T23:30:00Z');

function app(db: Database = stubDatabase(), limit = 100) {
  const router = Router();
  router.use(
    searchRoutes({
      db,
      tokens: createAccessTokens(testConfig.auth.jwtSecret),
      appConfig: unusedConfig,
      storage: fakePhotoStorage().storage,
      ipLimit: { windowMs: 60_000, limit },
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

describe('POST /search', () => {
  it('names every invalid field', async () => {
    const response = await request(app())
      .post('/api/v1/search')
      .send({ ...body, quantity: 0, days: 0, crop_id: 'yam' });
    expect(
      issues(response)
        .map((issue) => issue.path)
        .toSorted(),
    ).toEqual(['crop_id', 'days', 'quantity']);
  });

  it('refuses a start date before today in Lagos', async () => {
    const response = await request(app())
      .post('/api/v1/search')
      .send({ ...body, start_date: '2026-11-10' });
    expect(issues(response)).toEqual([
      { location: 'body', path: 'start_date', message: 'Choose today or a later date' },
    ]);
  });

  it('refuses an unknown crop', async () => {
    const response = await request(app(stubDatabase({ crops: [] })))
      .post('/api/v1/search')
      .send(body);
    expect(issues(response)).toEqual([
      { location: 'body', path: 'crop_id', message: 'Unknown crop' },
    ]);
  });

  it('returns 401 for an access token that is sent but invalid', async () => {
    const response = await request(app())
      .post('/api/v1/search')
      .set('Authorization', 'Bearer not-a-token')
      .send(body);
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('unauthorized');
  });

  it('is rate limited', async () => {
    const limited = app(stubDatabase(), 2);
    const invalid = { ...body, days: 0 };
    expect((await request(limited).post('/api/v1/search').send(invalid)).status).toBe(400);
    expect((await request(limited).post('/api/v1/search').send(invalid)).status).toBe(400);

    const response = await request(limited).post('/api/v1/search').send(body);
    expect(response.status).toBe(429);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('rate_limited');
  });
});
