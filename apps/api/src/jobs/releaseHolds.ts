import { sql } from 'kysely';
import { moveDueBookings, type DueBookingDependencies } from './dueBookings.js';

/**
 * Expires each `payment_pending` booking whose hold has lapsed (at `payment_expires_at` itself
 * too, as `startCharge` already refuses it), on the database's clock, freeing its space
 * (PRD 6.3). The hold expiry has no refund or SMS hook: nothing was paid and nobody is texted
 * (decision 105). A payment that lands afterwards is a late payment, refunded by `settleCharge`
 * (decision 94).
 */
export async function releaseHolds(deps: DueBookingDependencies) {
  const { moved, failed } = await moveDueBookings(deps, {
    job: 'release_holds',
    claim: async (trx, skip) => {
      const row = await trx
        .selectFrom('bookings')
        .select('id')
        .where('status', '=', 'payment_pending')
        .where('payment_expires_at', '<=', sql<Date>`now()`)
        .$if(skip.length > 0, (query) => query.where('id', 'not in', skip))
        .orderBy('payment_expires_at')
        .limit(1)
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();
      return row?.id;
    },
    request: (bookingId) => ({
      bookingId,
      to: 'expired',
      actor: { type: 'system' },
      reason: 'payment_hold_lapsed',
    }),
  });
  return { expired: moved, failed };
}
