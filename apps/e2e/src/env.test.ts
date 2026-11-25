import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPaystackTestKey, readE2eEnv } from './env.js';

const base = {
  PAYSTACK_SECRET_KEY: 'sk_test_abc123',
  E2E_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable',
};

function withEnv(values: Record<string, string | undefined>) {
  for (const name of ['PAYSTACK_SECRET_KEY', 'E2E_DATABASE_URL', 'E2E_WEB_URL', 'E2E_API_URL']) {
    vi.stubEnv(name, values[name]);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertPaystackTestKey', () => {
  it('accepts a Paystack test secret key', () => {
    expect(() => assertPaystackTestKey('sk_test_abc123')).not.toThrow();
  });

  it.each(['sk_live_abc123', 'pk_test_abc123', 'abc', ''])('refuses %j', (key) => {
    expect(() => assertPaystackTestKey(key)).toThrow(/test key/);
  });
});

describe('readE2eEnv', () => {
  it('defaults to the local web app and API, which the suite starts itself', () => {
    withEnv(base);
    expect(readE2eEnv()).toMatchObject({
      webUrl: 'http://localhost:4173',
      apiUrl: 'http://localhost:3000/api/v1',
      local: true,
    });
  });

  it('tests a deployment given both of its URLs, without a trailing slash', () => {
    withEnv({
      ...base,
      E2E_WEB_URL: 'https://staging.example.com/',
      E2E_API_URL: 'https://staging.example.com/api/v1/',
    });
    expect(readE2eEnv()).toMatchObject({
      webUrl: 'https://staging.example.com',
      apiUrl: 'https://staging.example.com/api/v1',
      local: false,
    });
  });

  it('refuses one URL without the other', () => {
    withEnv({ ...base, E2E_WEB_URL: 'https://staging.example.com' });
    expect(() => readE2eEnv()).toThrow(/together/);
  });

  it('refuses a live Paystack key before anything starts', () => {
    withEnv({ ...base, PAYSTACK_SECRET_KEY: 'sk_live_abc123' });
    expect(() => readE2eEnv()).toThrow(/test key/);
  });

  it.each(['PAYSTACK_SECRET_KEY', 'E2E_DATABASE_URL'])('requires %s', (name) => {
    withEnv({ ...base, [name]: undefined });
    expect(() => readE2eEnv()).toThrow(name);
  });
});
