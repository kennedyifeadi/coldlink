import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults the API to the same origin', () => {
    expect(parseEnv({})).toEqual({ VITE_API_URL: '/api/v1', VITE_SHOW_DEV_CODE: false });
  });

  it.each([
    ['/api/v1/', '/api/v1'],
    ['https://api.coldlink.ng/api/v1', 'https://api.coldlink.ng/api/v1'],
    ['https://api.coldlink.ng/api/v1/', 'https://api.coldlink.ng/api/v1'],
  ])('accepts %s', (value, expected) => {
    expect(parseEnv({ VITE_API_URL: value }).VITE_API_URL).toBe(expected);
  });

  it('refuses a value that is neither a path nor a URL', () => {
    expect(() => parseEnv({ VITE_API_URL: 'api.coldlink.ng' })).toThrow(/VITE_API_URL/);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads VITE_SHOW_DEV_CODE=%s', (value, expected) => {
    expect(parseEnv({ VITE_SHOW_DEV_CODE: value }).VITE_SHOW_DEV_CODE).toBe(expected);
  });

  it('refuses a VITE_SHOW_DEV_CODE that is not true or false', () => {
    expect(() => parseEnv({ VITE_SHOW_DEV_CODE: 'yes' })).toThrow(/VITE_SHOW_DEV_CODE/);
  });
});
