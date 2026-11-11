import type { Transaction } from 'kysely';
import type { Database } from './client.js';
import type { DB } from './schema.js';

/**
 * Runs `work` in a transaction. Inside one already, such as an integration test's, it runs in that
 * transaction, since Kysely cannot nest them.
 */
export function inTransaction<T>(
  db: Database,
  work: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  // Kysely only marks its Transaction class, and ControlledTransaction extends it, as a transaction.
  return db.isTransaction ? work(db as Transaction<DB>) : db.transaction().execute(work);
}
