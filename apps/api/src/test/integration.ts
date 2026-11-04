import type { ControlledTransaction } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { captureLogs } from './helpers.js';
import { requireTestDatabaseUrl, testDatabaseUrl } from './testDatabase.js';

export const integrationDatabaseUrl = testDatabaseUrl();

/** Integration suites run as `describe.skipIf(noTestDatabase)(...)`. */
export const noTestDatabase = integrationDatabaseUrl === undefined;

/**
 * Gives each test its own transaction on the test database, rolled back afterwards, so tests
 * see none of each other's rows and leave none behind. Call inside an integration suite.
 */
export function useTestTransaction(): () => Database {
  let pool: Database | undefined;
  let transaction: ControlledTransaction<DB> | undefined;

  beforeAll(() => {
    pool = createDatabase(
      { databaseUrl: requireTestDatabaseUrl(), databaseSslRootCert: undefined },
      captureLogs().logger,
    );
  });
  beforeEach(async () => {
    transaction = await pool?.startTransaction().execute();
  });
  afterEach(async () => {
    await transaction?.rollback().execute();
    transaction = undefined;
  });
  afterAll(async () => {
    await pool?.destroy();
  });

  return () => {
    if (transaction === undefined) throw new Error('No test transaction is open');
    return transaction;
  };
}
