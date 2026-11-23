import { sql } from 'kysely';
import { moveDueBookings, type DueBookingDependencies } from './dueBookings.js';

/**
 * Expires each `pending_provider` booking the provider did not answer by
 * `provider_response_due_at` (at that instant too, when the action link stops resending), on the
 * database's clock. The transition's hooks refund the farmer in full and send `booking_rejected`
 * with reason `expired` (decision 105).
 */
export async function expireUnanswered(deps: DueBookingDependencies) {
  const { moved, failed } = await moveDueBookings(deps, {
    job: 'expire_unanswered',
    claim: async (trx, skip) => {
      const row = await trx
        .selectFrom('bookings')
        .select('id')
        .where('status', '=', 'pending_provider')
        .where('provider_response_due_at', '<=', sql<Date>`now()`)
        .$if(skip.length > 0, (query) => query.where('id', 'not in', skip))
        .orderBy('provider_response_due_at')
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
      reason: 'provider_did_not_respond',
    }),
  });
  return { expired: moved, failed };
}
