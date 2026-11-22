import type { Transaction } from 'kysely';
import type { Logger } from 'pino';
import type { TransitionHooks } from '../bookings/hooks.js';
import {
  runAfterCommitHooks,
  transitionBooking,
  type TransitionRequest,
} from '../bookings/transition.js';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { inTransaction } from '../db/transaction.js';

/** How many bookings one run moves at most; the rest wait a minute for the next run. */
export const DUE_BOOKINGS_BATCH_SIZE = 50;

export interface DueBookingDependencies {
  db: Database;
  hooks: TransitionHooks;
  logger: Logger;
  /** Set while shutting down: the row in hand finishes and no other is started. */
  signal?: AbortSignal | undefined;
}

export interface DueBookingMove {
  job: string;
  /**
   * Locks and returns the id of one due booking, skipping rows another transaction holds (a
   * payment or an answer in progress, or another worker) and the ids in `skip`.
   */
  claim: (trx: Transaction<DB>, skip: readonly string[]) => Promise<string | undefined>;
  request: (bookingId: string) => TransitionRequest;
  limit?: number;
}

/**
 * Moves due bookings one at a time, each in its own transaction through `transitionBooking`, then
 * runs that booking's after-commit hooks, so the refund and SMS hooks fire as for any other
 * transition. A booking that fails is logged and left for the next run.
 */
export async function moveDueBookings(
  { db, hooks, logger, signal }: DueBookingDependencies,
  { job, claim, request, limit = DUE_BOOKINGS_BATCH_SIZE }: DueBookingMove,
): Promise<{ moved: number; failed: number }> {
  const failed: string[] = [];
  let moved = 0;
  while (!signal?.aborted && moved + failed.length < limit) {
    let claimed: string | undefined;
    try {
      const result = await inTransaction(db, async (trx) => {
        claimed = await claim(trx, failed);
        return claimed === undefined ? undefined : transitionBooking(trx, hooks, request(claimed));
      });
      if (result === undefined) break;
      await runAfterCommitHooks(logger, result);
      moved += 1;
    } catch (err) {
      if (claimed === undefined) throw err;
      failed.push(claimed);
      logger.error({ err, job, bookingId: claimed }, 'Scheduled booking transition failed');
    }
  }
  return { moved, failed: failed.length };
}
