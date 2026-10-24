import { errorResponseSchema } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testApp } from '../test/helpers.js';
import { rateLimit } from './rateLimit.js';

function routes(): Router {
  const router = Router();
  router.get('/limited', rateLimit({ windowMs: 60_000, limit: 2 }), (_req, res) => {
    res.json({ ok: true });
  });
  return router;
}

describe('rateLimit', () => {
  it('returns 429 in the error shape once the limit is used up', async () => {
    const { app } = testApp(routes());
    expect((await request(app).get('/api/v1/limited')).status).toBe(200);
    expect((await request(app).get('/api/v1/limited')).status).toBe(200);

    const response = await request(app).get('/api/v1/limited');
    expect(response.status).toBe(429);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('rate_limited');
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('keeps a separate count for each limiter', async () => {
    const first = testApp(routes());
    const second = testApp(routes());
    await request(first.app).get('/api/v1/limited');
    await request(first.app).get('/api/v1/limited');
    expect((await request(second.app).get('/api/v1/limited')).status).toBe(200);
  });
});
