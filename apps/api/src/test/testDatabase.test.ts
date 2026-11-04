import { describe, expect, it } from 'vitest';
import { requireTestDatabaseUrl, TestDatabaseError, testDatabaseUrl } from './testDatabase.js';

const local = 'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable';
const supabase =
  'postgresql://postgres.abcd:s3cret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

describe('testDatabaseUrl', () => {
  it.each([
    local,
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgres://postgres:postgres@[::1]:5432/postgres',
  ])('allows a local database: %s', (url) => {
    expect(testDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it('skips when TEST_DATABASE_URL is unset outside CI, even if DATABASE_URL is set', () => {
    expect(testDatabaseUrl({ DATABASE_URL: supabase })).toBeUndefined();
    expect(testDatabaseUrl({ TEST_DATABASE_URL: '' })).toBeUndefined();
  });

  it('fails in CI when TEST_DATABASE_URL is unset', () => {
    expect(() => testDatabaseUrl({ CI: 'true' })).toThrow(TestDatabaseError);
  });

  it.each([supabase, 'postgresql://postgres:s3cret@db.abcd.supabase.co:5432/postgres'])(
    'refuses a hosted database without echoing its URL: %s',
    (url) => {
      expect(() => testDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow(
        /must point at a throwaway database on localhost/,
      );
      expect(() => testDatabaseUrl({ TEST_DATABASE_URL: url })).not.toThrow(/s3cret/);
    },
  );

  it('refuses the same URL as DATABASE_URL', () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: local, DATABASE_URL: local })).toThrow(
      /must not be the same as DATABASE_URL/,
    );
  });

  it('refuses a value that is not a URL', () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: 'localhost' })).toThrow(/not a valid URL/);
  });
});

describe('requireTestDatabaseUrl', () => {
  it('fails when TEST_DATABASE_URL is unset', () => {
    expect(() => requireTestDatabaseUrl({})).toThrow(TestDatabaseError);
  });
});
