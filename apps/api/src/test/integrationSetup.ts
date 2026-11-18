import { sql } from 'kysely';
import { createDatabase } from '../db/client.js';
import { captureLogs } from './helpers.js';
import { testDatabaseUrl } from './testDatabase.js';

// No migration seeds these; only after-commit hooks and tests write them. A row still there after
// the run is one a committing test's cleanup missed, which later suites would see.
const LEAK_CHECKED_TABLES = ['notifications', 'action_tokens'] as const;

async function failOnLeftRows(databaseUrl: string): Promise<void> {
  const db = createDatabase({ databaseUrl, databaseSslRootCert: undefined }, captureLogs().logger);
  try {
    const left: string[] = [];
    for (const table of LEAK_CHECKED_TABLES) {
      const { rows } = await sql<{ count: number }>`
        select count(*)::int as count from ${sql.table(`public.${table}`)}
      `.execute(db);
      const count = rows[0]?.count ?? 0;
      if (count > 0) left.push(`${table}: ${String(count)}`);
    }
    if (left.length > 0) {
      throw new Error(
        `Committed test rows were left in the test database (${left.join(', ')}). Every ` +
          'committing test must delete what it and its hooks wrote.',
      );
    }
  } finally {
    await db.destroy();
  }
}

export default function setup(): (() => Promise<void>) | undefined {
  const databaseUrl = testDatabaseUrl();
  if (databaseUrl === undefined) {
    console.warn(
      'TEST_DATABASE_URL is not set, so the integration tests are skipped. Point it at a ' +
        'throwaway database on localhost with the migrations applied to run them.',
    );
    return undefined;
  }
  return () => failOnLeftRows(databaseUrl);
}
