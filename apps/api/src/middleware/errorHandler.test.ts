import { errorResponseSchema } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.js';
import { testApp } from '../test/helpers.js';

const secret = 'connection to db-internal:5432 refused for user svc_admin';

function routes(): Router {
  const router = Router();
  router.get('/boom', () => {
    throw new Error(secret);
  });
  router.get('/async-boom', async () => {
    await Promise.resolve();
    throw new TypeError(secret);
  });
  router.get('/missing', () => {
    throw new AppError('not_found', 'Booking not found', { booking_id: 'b-1' });
  });
  return router;
}

describe('errorHandler', () => {
  it.each(['/api/v1/boom', '/api/v1/async-boom'])(
    'returns a generic 500 with no stack or raw message for %s',
    async (path) => {
      const { app } = testApp(routes());
      const response = await request(app).get(path);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: { code: 'internal', message: 'Something went wrong. Please try again.' },
      });
      expect(response.text).not.toContain(secret);
      expect(response.text).not.toContain('at ');
    },
  );

  it('logs the unexpected error with the request id', async () => {
    const { app, logs } = testApp(routes());
    const response = await request(app).get('/api/v1/boom');
    const entry = logs.lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((log) => log['msg'] === 'Unexpected error');
    expect(entry).toMatchObject({
      level: 50,
      req: { id: response.headers['x-request-id'] },
      err: { message: secret },
    });
  });

  it('returns an AppError with its own status, message and details', async () => {
    const { app } = testApp(routes());
    const response = await request(app).get('/api/v1/missing');
    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(response.body)).toEqual({
      error: { code: 'not_found', message: 'Booking not found', details: { booking_id: 'b-1' } },
    });
  });
});
