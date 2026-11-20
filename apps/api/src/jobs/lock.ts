import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';

/** The bigint advisory lock key for a job, in a namespace nothing else locks. */
function lockKey(job: string) {
  return sql<string>`hashtextextended(${`coldlink.job.${job}`}, 0)`;
}

async function tryLock(db: Kysely<DB>, job: string, scope: 'session' | 'transaction') {
  const lock =
    scope === 'session'
      ? sql<{ locked: boolean }>`select pg_try_advisory_lock(${lockKey(job)}) as locked`
      : sql<{ locked: boolean }>`select pg_try_advisory_xact_lock(${lockKey(job)}) as locked`;
  const { rows } = await lock.execute(db);
  return rows[0]?.locked === true;
}

export type LockedRun<T> = { ran: true; result: T } | { ran: false };

/**
 * Runs `work` only while holding the job's Postgres advisory lock, so with several API instances
 * one runs each job at a time; another instance's run, or one still going here, makes this one do
 * nothing. The lock is session-scoped on a reserved connection, because a job commits each
 * booking on its own and the lock must outlast those transactions. Inside a transaction already,
 * such as an integration test's, it takes the transaction-scoped lock, since Kysely cannot reserve
 * a connection there.
 */
export async function withJobLock<T>(
  db: Database,
  job: string,
  work: () => Promise<T>,
): Promise<LockedRun<T>> {
  if (db.isTransaction) {
    if (!(await tryLock(db, job, 'transaction'))) return { ran: false };
    return { ran: true, result: await work() };
  }
  return db.connection().execute(async (connection) => {
    if (!(await tryLock(connection, job, 'session'))) return { ran: false };
    try {
      return { ran: true, result: await work() };
    } finally {
      await sql`select pg_advisory_unlock(${lockKey(job)})`.execute(connection);
    }
  });
}
