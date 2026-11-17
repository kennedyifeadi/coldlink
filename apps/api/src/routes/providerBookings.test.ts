import { errorResponseSchema, validationIssueSchema, type UserRole } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import { createTransitionHooks } from '../bookings/hooks.js';
import { captureLogs, stubDatabase, testConfig } from '../test/helpers.js';
import { providerBookingRoutes } from './providerBookings.js';

// Everything here is refused before a booking is read, so a stub database is enough; the actions
// themselves are covered against Postgres in providerBookings.integration.test.ts.

const tokens = createAccessTokens(testConfig.auth.jwtSecret);
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
  router.use(providerBookingRoutes({ db, tokens, hooks: createTransitionHooks() }));
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

const actions = ['accept', 'reject', 'check-in', 'collect'] as const;

describe.each(actions)('POST /bookings/:id/%s', (action) => {
  const path = `/api/v1/bookings/${bookingId}/${action}`;

  it('needs a signed-in user', async () => {
    const response = await (await agentFor()).post(path);
    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('unauthorized');
  });

  it('is not for farmers', async () => {
    const response = await (await agentFor(['farmer'])).post(path);
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('forbidden');
  });

  it('refuses a booking id that is not a uuid', async () => {
    const response = await (
      await agentFor(['provider'])
    ).post(`/api/v1/bookings/CL-7K3Q9/${action}`);
    expect(response.status).toBe(400);
    const issues = z
      .array(validationIssueSchema)
      .parse(errorResponseSchema.parse(response.body).error.details);
    expect(issues).toMatchObject([{ location: 'params', path: 'id' }]);
  });
});

describe.each(['check-in', 'collect'])('POST /bookings/:id/%s by an admin', (action) => {
  it('is refused: only the provider at the facility can confirm it', async () => {
    const response = await (
      await agentFor(['admin'])
    ).post(`/api/v1/bookings/${bookingId}/${action}`);
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('forbidden');
  });
});

describe('POST /bookings/:id/reject', () => {
  it('refuses an empty reason', async () => {
    const response = await (
      await agentFor(['provider'])
    )
      .post(`/api/v1/bookings/${bookingId}/reject`)
      .send({ reason: '  ' });
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.details).toMatchObject([
      { location: 'body', path: 'reason' },
    ]);
  });

  it('needs no body, as the reason is optional', async () => {
    // The stub database has no bookings, so getting as far as the lookup ends in a 404.
    const response = await (
      await agentFor(['provider'])
    ).post(`/api/v1/bookings/${bookingId}/reject`);
    expect(response.status).toBe(404);
  });

  it('refuses fields other than the reason', async () => {
    const response = await (
      await agentFor(['provider'])
    )
      .post(`/api/v1/bookings/${bookingId}/reject`)
      .send({ reason: 'Full', status: 'confirmed' });
    expect(response.status).toBe(400);
  });
});
