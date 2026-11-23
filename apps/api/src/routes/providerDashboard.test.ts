import { errorResponseSchema, validationIssueSchema, type UserRole } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import { captureLogs, stubDatabase, testConfig } from '../test/helpers.js';
import { providerDashboardRoutes } from './providerDashboard.js';

// Everything here is refused before a facility is read, so a stub database is enough; the reads
// themselves are covered against Postgres in providerDashboard.integration.test.ts.

const tokens = createAccessTokens(testConfig.auth.jwtSecret);
const providerId = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const bookingId = '3c9e2a1b-7d4f-4e8a-b5c6-0d1e2f3a4b5c';

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

async function agentFor(roles?: UserRole[]) {
  const db = stubDatabase(roles === undefined ? {} : { users: [user(roles)] });
  const router = Router();
  router.use(providerDashboardRoutes({ db, tokens }));
  const agent = request.agent(
    createApp(testConfig, { db, logger: captureLogs().logger, routes: router }),
  );
  if (roles !== undefined) {
    const { id, coldlink_id } = user(roles);
    agent.set('Authorization', `Bearer ${await tokens.sign({ sub: id, cid: coldlink_id, roles })}`);
  }
  return agent;
}

function errorCode(response: request.Response): string {
  return errorResponseSchema.parse(response.body).error.code;
}

const paths = [
  `/api/v1/providers/${providerId}/dashboard`,
  `/api/v1/providers/${providerId}/bookings?group=requests`,
  `/api/v1/providers/${providerId}/bookings/${bookingId}`,
];

describe.each(paths)('GET %s', (path) => {
  it('needs a signed-in user, and is not cached', async () => {
    const response = await (await agentFor()).get(path);
    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('unauthorized');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('refuses a farmer with a 403 before any lookup', async () => {
    const response = await (await agentFor(['farmer'])).get(path);
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('forbidden');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('refuses a facility id that is not a uuid', async () => {
    const response = await (await agentFor(['provider'])).get(path.replace(providerId, 'mine'));
    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('validation_failed');
  });
});

describe('GET /providers/:id/bookings', () => {
  async function issues(query: string) {
    const response = await (
      await agentFor(['provider'])
    ).get(`/api/v1/providers/${providerId}/bookings${query}`);
    expect(response.status).toBe(400);
    const { details } = errorResponseSchema.parse(response.body).error;
    return z.array(validationIssueSchema).parse(details);
  }

  it('needs a group', async () => {
    expect(await issues('')).toEqual([
      expect.objectContaining({ location: 'query', path: 'group' }),
    ]);
  });

  it('refuses a cursor that is not a booking id', async () => {
    expect(await issues('?group=past&cursor=2')).toEqual([
      expect.objectContaining({ location: 'query', path: 'cursor' }),
    ]);
  });

  it('refuses a booking id that is not a uuid in the detail path', async () => {
    const response = await (
      await agentFor(['provider'])
    ).get(`/api/v1/providers/${providerId}/bookings/CL-7K3Q9`);
    expect(response.status).toBe(400);
  });
});
