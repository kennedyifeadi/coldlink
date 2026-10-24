import { errorResponseSchema } from '@coldlink/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGIN, testApp } from './test/helpers.js';
import { version } from './version.js';

describe('GET /api/v1/health', () => {
  it('returns ok with the app version', async () => {
    const { app } = testApp();
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', version });
  });
});

describe('unknown routes', () => {
  it.each(['/api/v1/nope', '/health', '/'])(
    'returns 404 in the error shape for %s',
    async (path) => {
      const { app } = testApp();
      const response = await request(app).get(path);
      expect(response.status).toBe(404);
      expect(errorResponseSchema.parse(response.body).error.code).toBe('not_found');
    },
  );
});

describe('X-Request-Id', () => {
  it('echoes a well-formed incoming id', async () => {
    const { app } = testApp();
    const response = await request(app).get('/api/v1/health').set('X-Request-Id', 'abc-123.DEF');
    expect(response.headers['x-request-id']).toBe('abc-123.DEF');
  });

  it.each(['', 'has spaces', 'x'.repeat(129), 'badéchar'])(
    'replaces a malformed id %j with a generated one',
    async (incoming) => {
      const { app } = testApp();
      const response = await request(app).get('/api/v1/health').set('X-Request-Id', incoming);
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it('generates an id when none is sent and tags the request log with it', async () => {
    const { app, logs } = testApp();
    const response = await request(app).get('/api/v1/health');
    const id = response.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(logs.output()).toContain(`"id":"${id}"`);
  });
});

describe('body size limit', () => {
  it('returns 413 in the error shape for a body over 100kb', async () => {
    const { app } = testApp();
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(101 * 1024) }));
    expect(response.status).toBe(413);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('payload_too_large');
  });

  it('returns 400 bad_request for malformed JSON', async () => {
    const { app } = testApp();
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"unclosed":');
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('bad_request');
  });
});

describe('CORS', () => {
  it('allows an origin on the allowlist', async () => {
    const { app } = testApp();
    const response = await request(app).get('/api/v1/health').set('Origin', ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('answers a preflight from an allowed origin', async () => {
    const { app } = testApp();
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('sends no CORS headers to an origin off the allowlist', async () => {
    const { app } = testApp();
    const response = await request(app).get('/api/v1/health').set('Origin', 'https://evil.test');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides Express', async () => {
    const { app } = testApp();
    const response = await request(app).get('/api/v1/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
