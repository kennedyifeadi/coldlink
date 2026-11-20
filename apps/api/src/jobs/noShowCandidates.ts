import { todayInLagos } from '@coldlink/shared';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';

export const NO_SHOW_BATCH_SIZE = 100;

export interface NoShowDependencies {
  db: Database;
  now?: () => Date;
}

/**
 * Flags, once, each confirmed booking whose whole start day in Lagos has passed with no check-in,
 * so the admin screens can list it (decision 110). It moves nothing, refunds nothing and texts
 * nobody: whether the deposit is forfeit is an admin's call (PRD 6.5). Works in batches, each in
 * a transaction of its own.
 */
export async function flagNoShowCandidates(
  { db, now = () => new Date() }: NoShowDependencies,
  batchSize = NO_SHOW_BATCH_SIZE,
): Promise<{ flagged: number }> {
  const today = todayInLagos(now());
  let flagged = 0;
  for (;;) {
    const batch = await inTransaction(db, async (trx) => {
      const { numUpdatedRows } = await trx
        .updateTable('bookings')
        .set({ no_show_flagged_at: sql<Date>`now()` })
        .where('id', 'in', (eb) =>
          eb
            .selectFrom('bookings')
            .select('id')
            .where('status', '=', 'confirmed')
            .where('start_date', '<', today)
            .where('no_show_flagged_at', 'is', null)
            .orderBy('start_date')
            .limit(batchSize)
            .forUpdate()
            .skipLocked(),
        )
        .executeTakeFirst();
      return Number(numUpdatedRows);
    });
    flagged += batch;
    if (batch < batchSize) return { flagged };
  }
}
