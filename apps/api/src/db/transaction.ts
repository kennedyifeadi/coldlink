import type { Database } from './client.js';

/**
 * Runs `work` in a transaction. Inside one already, such as an integration test's, it runs in that
 * transaction, since Kysely cannot nest them.
 */
export function inTransaction<T>(db: Database, work: (trx: Database) => Promise<T>): Promise<T> {
  return db.isTransaction ? work(db) : db.transaction().execute(work);
}
