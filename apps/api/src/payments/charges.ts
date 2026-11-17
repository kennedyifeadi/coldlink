import type { BookingStatus } from '@coldlink/shared';
import { sql, type Transaction } from 'kysely';
import type { Logger } from 'pino';
import type { AppConfigReader } from '../appConfig.js';
import { availableQuantity } from '../bookings/availability.js';
import type { TransitionHooks } from '../bookings/hooks.js';
import {
  BookingNotFoundError,
  runAfterCommitHooks,
  transitionBooking,
  type TransitionResult,
} from '../bookings/transition.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { inTransaction } from '../db/transaction.js';
import { AppError } from '../errors.js';
import { lockProvider } from '../providers/store.js';
import {
  customerEmail,
  maskReference,
  type GatewayCharge,
  type PaymentGateway,
} from './gateway.js';
import { refundBooking } from './refunds.js';
import { generatePaymentReference, mergePayload } from './store.js';

export interface ChargeDependencies {
  db: Database;
  gateway: PaymentGateway;
  appConfig: AppConfigReader;
  hooks: TransitionHooks;
  config: Pick<Config, 'webAppUrl'>;
}

/** The web app's route Paystack returns the farmer to, adding `?trxref=&reference=`. */
export const PAYMENT_RETURN_PATH = '/payment/return';

export interface Payer {
  id: string;
  coldlinkId: string;
}

export interface StartedCharge {
  reference: string;
  authorizationUrl: string;
}

type OpenCharge =
  | { kind: 'ready'; reference: string; authorizationUrl: string }
  | { kind: 'starting'; reference: string }
  | { kind: 'new'; reference: string; amountKobo: number };

/**
 * Finds the booking's open charge, or records a new `initiated` one, under the booking's row lock,
 * so two calls at once never make two charges.
 */
function openCharge(db: Database, payer: Payer, bookingId: string): Promise<OpenCharge> {
  return inTransaction(db, async (trx) => {
    const booking = await trx
      .selectFrom('bookings')
      .select([
        'status',
        'total_charged_online_kobo',
        'payment_expires_at',
        sql<boolean>`coalesce(payment_expires_at > now(), false)`.as('hold_active'),
      ])
      .where('id', '=', bookingId)
      .where('farmer_id', '=', payer.id)
      .forUpdate()
      .executeTakeFirst();
    if (booking === undefined) throw new BookingNotFoundError(bookingId);
    if (booking.status !== 'payment_pending') {
      throw new AppError('conflict', 'This booking is not awaiting payment', {
        booking_id: bookingId,
        status: booking.status,
      });
    }
    if (!booking.hold_active) {
      throw new AppError('conflict', 'The time to pay for this booking has run out', {
        booking_id: bookingId,
        status: booking.status,
        payment_expires_at: booking.payment_expires_at?.toISOString() ?? null,
      });
    }

    const open = await trx
      .selectFrom('payments')
      .select([
        'provider_ref',
        sql<string | null>`paystack_payload ->> 'authorization_url'`.as('authorization_url'),
      ])
      .where('booking_id', '=', bookingId)
      .where('purpose', '=', 'booking_deposit')
      .where('status', '=', 'initiated')
      .executeTakeFirst();
    if (open !== undefined) {
      return open.authorization_url === null
        ? { kind: 'starting', reference: open.provider_ref }
        : {
            kind: 'ready',
            reference: open.provider_ref,
            authorizationUrl: open.authorization_url,
          };
    }

    const reference = generatePaymentReference('charge');
    await trx
      .insertInto('payments')
      .values({
        booking_id: bookingId,
        provider_ref: reference,
        purpose: 'booking_deposit',
        amount_kobo: booking.total_charged_online_kobo,
        status: 'initiated',
      })
      .execute();
    return { kind: 'new', reference, amountKobo: booking.total_charged_online_kobo };
  });
}

/**
 * Starts the farmer's payment for their `payment_pending` booking while its hold lasts, for the
 * booking's own online total, and returns Paystack's checkout page. Calling again while that
 * charge is open returns the same page (decision 92).
 */
export async function startCharge(
  { db, gateway, appConfig, config }: ChargeDependencies,
  payer: Payer,
  bookingId: string,
): Promise<StartedCharge> {
  const { paystack_channels } = await appConfig.get();
  const charge = await openCharge(db, payer, bookingId);
  if (charge.kind === 'ready') return charge;
  if (charge.kind === 'starting') {
    throw new AppError('conflict', 'The payment is still being set up. Try again shortly.', {
      booking_id: bookingId,
    });
  }

  try {
    const page = await gateway.initialize({
      reference: charge.reference,
      amountKobo: charge.amountKobo,
      email: customerEmail(payer.coldlinkId),
      callbackUrl: new URL(PAYMENT_RETURN_PATH, config.webAppUrl).toString(),
      channels: paystack_channels,
    });
    await db
      .updateTable('payments')
      .set({
        paystack_payload: mergePayload({
          authorization_url: page.authorizationUrl,
          access_code: page.accessCode,
        }),
      })
      .where('provider_ref', '=', charge.reference)
      .execute();
    return { reference: charge.reference, authorizationUrl: page.authorizationUrl };
  } catch (err) {
    // A start that failed is closed, so the next call begins again with a new reference.
    const error = err instanceof Error ? err.message : 'Unknown error';
    await db
      .updateTable('payments')
      .set({ status: 'failed', paystack_payload: mergePayload({ error }) })
      .where('provider_ref', '=', charge.reference)
      .where('status', '=', 'initiated')
      .execute();
    throw err;
  }
}

/** What confirming a paid charge did. */
export type ChargeOutcome =
  /** No booking charge has this reference: another integration's, or a forgery that was signed. */
  | { kind: 'unknown' }
  /** Already confirmed, by the webhook or a verify, so nothing changed. */
  | { kind: 'already_confirmed'; bookingId: string }
  /** The amount or currency is not the booking's, so nothing changed. */
  | { kind: 'mismatch'; bookingId: string }
  | { kind: 'confirmed'; bookingId: string; transition: TransitionResult }
  /** Paid, but the booking could no longer take it; the charge is refunded in full. */
  | { kind: 'late'; bookingId: string; bookingStatus: BookingStatus };

async function lockedBooking(trx: Transaction<DB>, bookingId: string) {
  return trx
    .selectFrom('bookings')
    .select([
      'status',
      'provider_id',
      'quantity',
      'start_date',
      'end_date',
      'total_charged_online_kobo',
      sql<boolean>`coalesce(payment_expires_at > now(), false)`.as('hold_active'),
    ])
    .where('id', '=', bookingId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

/**
 * Whether a paid booking can still take its space. A lapsed hold no longer counts in the free
 * capacity (decision 38), so the booking fits only if its quantity is still free.
 */
async function canTakePayment(
  trx: Transaction<DB>,
  booking: Awaited<ReturnType<typeof lockedBooking>>,
): Promise<boolean> {
  if (booking.status !== 'payment_pending') return false;
  if (booking.hold_active) return true;
  const free = await availableQuantity(
    trx,
    booking.provider_id,
    booking.start_date,
    booking.end_date,
  );
  return free >= booking.quantity;
}

/**
 * Records a charge Paystack reports as paid, once. Locks the provider (as `POST /bookings` does,
 * so a lapsed hold's space is re-checked against bookings made meanwhile), then the charge, then
 * the booking. A charge that is no longer `initiated` was confirmed before, so the replayed event
 * or racing verify changes nothing. A confirmed booking moves to `pending_provider` and the
 * provider's response clock starts at `paid_at` (decision 93); a late one is left as it is.
 */
async function confirmCharge(
  { db, appConfig, hooks }: ChargeDependencies,
  charge: GatewayCharge,
): Promise<ChargeOutcome> {
  const { provider_response_minutes } = await appConfig.get();
  return inTransaction(db, async (trx) => {
    const found = await trx
      .selectFrom('payments')
      .innerJoin('bookings', 'bookings.id', 'payments.booking_id')
      .select(['payments.id', 'payments.booking_id', 'bookings.provider_id'])
      .where('payments.provider_ref', '=', charge.reference)
      .where('payments.purpose', '=', 'booking_deposit')
      .executeTakeFirst();
    if (found === undefined) return { kind: 'unknown' };
    const bookingId = found.booking_id;

    await lockProvider(trx, found.provider_id);
    const payment = await trx
      .selectFrom('payments')
      .select('status')
      .where('id', '=', found.id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (payment.status !== 'initiated') return { kind: 'already_confirmed', bookingId };

    const booking = await lockedBooking(trx, bookingId);
    if (charge.amountKobo !== booking.total_charged_online_kobo || charge.currency !== 'NGN') {
      return { kind: 'mismatch', bookingId };
    }

    await trx
      .updateTable('payments')
      .set({
        status: 'success',
        paid_at: sql<Date>`now()`,
        paystack_payload: mergePayload({ charge: charge.record }),
      })
      .where('id', '=', found.id)
      .execute();

    if (!(await canTakePayment(trx, booking))) {
      return { kind: 'late', bookingId, bookingStatus: booking.status as BookingStatus };
    }
    const transition = await transitionBooking(trx, hooks, {
      bookingId,
      to: 'pending_provider',
      actor: { type: 'system' },
      metadata: { payment_reference: charge.reference },
    });
    await trx
      .updateTable('bookings')
      // now() is fixed for the transaction, so this is paid_at plus the response time.
      .set({
        provider_response_due_at: sql<Date>`now() + make_interval(mins => ${provider_response_minutes}::int)`,
      })
      .where('id', '=', bookingId)
      .execute();
    return { kind: 'confirmed', bookingId, transition };
  });
}

export interface SettledCharge {
  outcome: ChargeOutcome;
  /** The work that must wait for the commit: the transition's hooks, or a late charge's refund. */
  afterCommit: () => Promise<void>;
}

/** Confirms a paid charge in one transaction; the caller runs `afterCommit` once it returns. */
export async function settleCharge(
  deps: ChargeDependencies & { logger: Logger },
  charge: GatewayCharge,
): Promise<SettledCharge> {
  const outcome = await confirmCharge(deps, charge);
  const log = { reference: maskReference(charge.reference) };
  switch (outcome.kind) {
    case 'confirmed':
      return { outcome, afterCommit: () => runAfterCommitHooks(deps.logger, outcome.transition) };
    case 'late':
      deps.logger.warn(
        { ...log, bookingId: outcome.bookingId, bookingStatus: outcome.bookingStatus },
        'Late payment for a booking that can no longer take it; refunding in full',
      );
      return {
        outcome,
        afterCommit: async () => {
          await refundBooking(deps, {
            bookingId: outcome.bookingId,
            amount: 'full',
            reason: 'late_payment',
          });
        },
      };
    case 'mismatch':
      deps.logger.error(
        {
          ...log,
          bookingId: outcome.bookingId,
          amountKobo: charge.amountKobo,
          currency: charge.currency,
        },
        'Paystack charge does not match its booking',
      );
      return { outcome, afterCommit: () => Promise.resolve() };
    default:
      deps.logger.info({ ...log, outcome: outcome.kind }, 'Paystack charge needed no change');
      return { outcome, afterCommit: () => Promise.resolve() };
  }
}
