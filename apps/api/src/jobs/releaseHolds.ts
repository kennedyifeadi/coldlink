import { sql } from 'kysely';
import { settleCharge, type ChargeDependencies } from '../payments/charges.js';
import { maskReference, type GatewayCharge } from '../payments/gateway.js';
import type { Database } from '../db/client.js';
import { moveDueBookings, type DueBookingDependencies } from './dueBookings.js';

/** How many lapsed holds with an open charge one run asks Paystack about. */
export const OPEN_CHARGE_BATCH_SIZE = 50;

/**
 * How long past its deadline a hold waits for a payment Paystack still has in progress, such as a
 * bank transfer, before it expires anyway.
 */
export const IN_PROGRESS_GRACE_MINUTES = 30;

// Paystack's statuses for a payment it has not finished. Any other but success is final.
const IN_PROGRESS = new Set(['ongoing', 'pending', 'processing', 'queued']);

export interface HoldReleaseDependencies
  extends DueBookingDependencies, Pick<ChargeDependencies, 'gateway' | 'appConfig'> {}

interface OpenCharge {
  bookingId: string;
  reference: string;
  /** Past the deadline by more than the grace a payment in progress gets. */
  overdue: boolean;
}

function lapsedHoldsWithOpenCharges(db: Database): Promise<OpenCharge[]> {
  return db
    .selectFrom('bookings')
    .innerJoin('payments', 'payments.booking_id', 'bookings.id')
    .select([
      'bookings.id as bookingId',
      'payments.provider_ref as reference',
      sql<boolean>`bookings.payment_expires_at <= now() - make_interval(mins => ${IN_PROGRESS_GRACE_MINUTES}::int)`.as(
        'overdue',
      ),
    ])
    .where('bookings.status', '=', 'payment_pending')
    .where('bookings.payment_expires_at', '<=', sql<Date>`now()`)
    .where('payments.purpose', '=', 'booking_deposit')
    .where('payments.status', '=', 'initiated')
    .orderBy('bookings.payment_expires_at')
    .limit(OPEN_CHARGE_BATCH_SIZE)
    .execute();
}

type ChargeCheck = 'paid' | 'unpaid' | 'waiting' | 'unchecked';

/**
 * Asks Paystack about a lapsed hold's open charge and confirms one it took, as the webhook would
 * have (decision 94): ColdLink may not have heard yet, because the webhook is late or the farmer
 * never came back from checkout. A charge Paystack cannot be asked about is left for the next run.
 */
async function checkOpenCharge(
  deps: HoldReleaseDependencies,
  { bookingId, reference, overdue }: OpenCharge,
): Promise<ChargeCheck> {
  let charge: GatewayCharge;
  try {
    charge = await deps.gateway.verify(reference);
  } catch (err) {
    deps.logger.warn(
      { err, bookingId, reference: maskReference(reference) },
      'Could not ask Paystack about a lapsed hold; it expires on a later run',
    );
    return 'unchecked';
  }
  if (charge.status !== 'success') {
    return IN_PROGRESS.has(charge.status) && !overdue ? 'waiting' : 'unpaid';
  }
  const settled = await settleCharge(deps, charge);
  await settled.afterCommit();
  // A charge for another amount changes nothing, so the hold is expired like an unpaid one.
  return settled.outcome.kind === 'mismatch' ? 'unpaid' : 'paid';
}

/**
 * Expires each `payment_pending` booking whose hold has lapsed (at `payment_expires_at` itself
 * too, as `startCharge` already refuses it), on the database's clock, freeing its space
 * (PRD 6.3). A hold whose charge is still open is first checked with Paystack, and expires only if
 * Paystack has no payment for it. The hold expiry has no refund or SMS hook: nothing was paid and
 * nobody is texted (decision 105). A payment that lands afterwards is a late payment, refunded by
 * `settleCharge` (decision 94).
 */
export async function releaseHolds(deps: HoldReleaseDependencies) {
  const counts = { paid: 0, waiting: 0, unchecked: 0 };
  const unpaid: string[] = [];
  for (const charge of await lapsedHoldsWithOpenCharges(deps.db)) {
    if (deps.signal?.aborted) break;
    const check = await checkOpenCharge(deps, charge);
    if (check === 'unpaid') unpaid.push(charge.bookingId);
    else counts[check] += 1;
  }

  const { moved, failed } = await moveDueBookings(deps, {
    job: 'release_holds',
    claim: async (trx, skip) => {
      const row = await trx
        .selectFrom('bookings')
        .select('id')
        .where('status', '=', 'payment_pending')
        .where('payment_expires_at', '<=', sql<Date>`now()`)
        .where((eb) =>
          eb.or([
            eb.not(
              eb.exists(
                eb
                  .selectFrom('payments')
                  .select('payments.id')
                  .whereRef('payments.booking_id', '=', 'bookings.id')
                  .where('payments.purpose', '=', 'booking_deposit')
                  .where('payments.status', '=', 'initiated'),
              ),
            ),
            ...(unpaid.length > 0 ? [eb('bookings.id', 'in', unpaid)] : []),
          ]),
        )
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
  return { expired: moved, failed, ...counts };
}
