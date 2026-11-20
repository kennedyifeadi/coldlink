import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { captureLogs } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { requireTestDatabaseUrl } from '../test/testDatabase.js';
import { withJobLock } from './lock.js';

const key = (job: string) => sql`hashtextextended(${`coldlink.job.${job}`}, 0)`;

describe.skipIf(noTestDatabase)('withJobLock', () => {
  const trx = useTestTransaction();
  // Another instance's sessions. Advisory locks write no rows, so nothing needs cleaning up.
  let other: Database;

  beforeAll(() => {
    other = createDatabase(
      { databaseUrl: requireTestDatabaseUrl(), databaseSslRootCert: undefined },
      captureLogs().logger,
    );
  });
  afterAll(async () => {
    await other.destroy();
  });

  it('does nothing while another session holds the job', async () => {
    await other.connection().execute(async (holder) => {
      await sql`select pg_advisory_lock(${key('release_holds')})`.execute(holder);
      try {
        let ran = false;
        const run = await withJobLock(trx(), 'release_holds', () => {
          ran = true;
          return Promise.resolve();
        });
        expect(run).toEqual({ ran: false });
        expect(ran).toBe(false);
      } finally {
        await sql`select pg_advisory_unlock(${key('release_holds')})`.execute(holder);
      }
    });
  });

  it('runs a job whose lock another job holds no part of', async () => {
    await other.connection().execute(async (holder) => {
      await sql`select pg_advisory_lock(${key('release_holds')})`.execute(holder);
      try {
        await expect(
          withJobLock(trx(), 'expire_unanswered', () => Promise.resolve(1)),
        ).resolves.toEqual({ ran: true, result: 1 });
      } finally {
        await sql`select pg_advisory_unlock(${key('release_holds')})`.execute(holder);
      }
    });
  });

  it('holds the lock on its own connection for the whole run, then lets it go', async () => {
    // A session lock belongs to one connection, so the unlock must use the same one.
    const tryFromOther = () =>
      other.connection().execute(async (connection) => {
        const { rows } = await sql<{ locked: boolean }>`
          select pg_try_advisory_lock(${key('sms_queue')}) as locked
        `.execute(connection);
        if (rows[0]?.locked === true) {
          await sql`select pg_advisory_unlock(${key('sms_queue')})`.execute(connection);
        }
        return rows[0]?.locked;
      });
    const pool = createDatabase(
      { databaseUrl: requireTestDatabaseUrl(), databaseSslRootCert: undefined },
      captureLogs().logger,
    );
    try {
      const run = await withJobLock(pool, 'sms_queue', async () => {
        // Work in transactions of its own, as a job's per-booking commits are.
        await pool.transaction().execute((work) => sql`select 1`.execute(work));
        return tryFromOther();
      });
      expect(run).toEqual({ ran: true, result: false });
      await expect(tryFromOther()).resolves.toBe(true);
    } finally {
      await pool.destroy();
    }
  });
});
