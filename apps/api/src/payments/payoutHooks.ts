import type { Transaction } from 'kysely';
import type { TransitionHooks } from '../bookings/hooks.js';
import type { BookingTransition } from '../bookings/transition.js';
import type { DB } from '../db/schema.js';

/** The deposit less the commission, from the booking's own snapshot (PRD 6.1). */
async function createOwedPayout(trx: Transaction<DB>, { bookingId }: BookingTransition) {
  await trx
    .insertInto('payouts')
    .columns(['provider_id', 'booking_id', 'amount_kobo'])
    .expression((eb) =>
      eb
        .selectFrom('bookings')
        .select((sb) => [
          'provider_id',
          'id',
          sb(sb.ref('deposit_kobo'), '-', sb.ref('commission_kobo')).as('amount_kobo'),
        ])
        .where('id', '=', bookingId),
    )
    .executeTakeFirstOrThrow();
}

/**
 * Records what ColdLink owes the provider when the produce is checked in (PRD 6.4). It runs in the
 * check-in's transaction, so a failed insert undoes the check-in too.
 */
export function registerPayoutHooks(hooks: TransitionHooks): void {
  hooks.inTransaction({
    name: 'payout_on_check_in',
    on: { from: 'confirmed', to: 'in_storage' },
    run: createOwedPayout,
  });
}
