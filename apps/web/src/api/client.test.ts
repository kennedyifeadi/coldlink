import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { otpRequestResponseSchema } from '@coldlink/shared';
import { errorResponse, jsonResponse, mockApi, requestsTo } from '../test/api';
import { apiRequest } from './client';

const requestCode = () =>
  apiRequest('/auth/otp/request', {
    method: 'POST',
    body: { phone: '+2348031234567' },
    schema: otpRequestResponseSchema,
  });

describe('apiRequest', () => {
  it('posts JSON with credentials and returns the parsed body', async () => {
    const fetchMock = mockApi({
      'POST /auth/otp/request': jsonResponse(200, {
        expires_in_seconds: 600,
        resend_after_seconds: 60,
      }),
    });

    await expect(requestCode()).resolves.toEqual({
      expires_in_seconds: 600,
      resend_after_seconds: 60,
    });
    const [[url, init] = []] = requestsTo(fetchMock, 'POST', '/auth/otp/request');
    expect(url).toBe('/api/v1/auth/otp/request');
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe('{"phone":"+2348031234567"}');
  });

  it('turns an error response into an ApiError with its code', async () => {
    mockApi({ 'POST /auth/otp/request': errorResponse(400, 'validation_failed') });

    await expect(requestCode()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'validation_failed',
      status: 400,
    });
  });

  it('reads the wait from details.retry_after_seconds', async () => {
    mockApi({
      'POST /auth/otp/request': errorResponse(429, 'rate_limited', {
        details: { retry_after_seconds: 42 },
        headers: { 'Retry-After': '50' },
      }),
    });

    await expect(requestCode()).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 42,
    });
  });

  it('falls back to the Retry-After header for the wait', async () => {
    mockApi({
      'POST /auth/otp/request': errorResponse(429, 'rate_limited', {
        headers: { 'Retry-After': '120' },
      }),
    });

    await expect(requestCode()).rejects.toMatchObject({ retryAfterSeconds: 120 });
  });

  it('leaves the wait unknown without either', async () => {
    mockApi({ 'POST /auth/otp/request': errorResponse(429, 'rate_limited') });

    await expect(requestCode()).rejects.toMatchObject({ retryAfterSeconds: undefined });
  });

  it('reports a request that never reached the API as a network error', async () => {
    mockApi({ 'POST /auth/otp/request': () => Promise.reject(new TypeError('Failed to fetch')) });

    await expect(requestCode()).rejects.toMatchObject({ code: 'network' });
  });

  it('reports a body that is not JSON, such as a proxy error page', async () => {
    mockApi({
      'POST /auth/otp/request': new Response('<html>Bad gateway</html>', { status: 502 }),
    });

    await expect(requestCode()).rejects.toMatchObject({
      code: 'unexpected_response',
      status: 502,
    });
  });

  it('reports a success body that does not match the shared schema', async () => {
    mockApi({ 'POST /auth/otp/request': jsonResponse(200, { expires_in_seconds: 'soon' }) });

    await expect(requestCode()).rejects.toMatchObject({ code: 'unexpected_response' });
  });

  it('parses a 204 as no body', async () => {
    mockApi({ 'POST /auth/logout': new Response(null, { status: 204 }) });

    await expect(
      apiRequest('/auth/logout', { method: 'POST', schema: z.undefined() }),
    ).resolves.toBeUndefined();
  });
});
