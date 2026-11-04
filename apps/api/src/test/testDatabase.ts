import { isLocalDatabaseHost } from '../config.js';

export class TestDatabaseError extends Error {
  override readonly name = 'TestDatabaseError';
}

/**
 * The only database that integration tests and type generation may use. They write and delete
 * rows, so they never read DATABASE_URL, and TEST_DATABASE_URL must point at localhost, which
 * rules out every hosted Supabase project. Returns undefined when it is unset, except in CI,
 * where skipping the integration tests would hide a failure.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env['TEST_DATABASE_URL'];
  if (value === undefined || value === '') {
    if (env['CI'] !== undefined && env['CI'] !== '') {
      throw new TestDatabaseError('TEST_DATABASE_URL must be set in CI');
    }
    return undefined;
  }
  // Messages never echo the URL: it holds a password.
  if (!URL.canParse(value)) {
    throw new TestDatabaseError('TEST_DATABASE_URL is not a valid URL');
  }
  if (!isLocalDatabaseHost(new URL(value))) {
    throw new TestDatabaseError(
      'TEST_DATABASE_URL must point at a throwaway database on localhost, never a Supabase project',
    );
  }
  if (value === env['DATABASE_URL']) {
    throw new TestDatabaseError('TEST_DATABASE_URL must not be the same as DATABASE_URL');
  }
  return value;
}

export function requireTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = testDatabaseUrl(env);
  if (url === undefined) {
    throw new TestDatabaseError('Set TEST_DATABASE_URL to a throwaway database on localhost');
  }
  return url;
}
