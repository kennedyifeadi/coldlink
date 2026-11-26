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
import { isStillPayable } from '../deliveries/rules.js';
import { contextTypeFor, directionOf, lockDelivery } from '../deliveries/store.js';
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
  /** The clock a delivery's window is judged by; the real one when left out. */
  now?: () => Date;
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

/** What is being paid for: a booking awaiting payment, or a delivery requested after booking. */
export type ChargeTarget = { bookingId: string } | { deliveryRequestId: string };

type OpenCharge =
  | { kind: 'ready'; reference: string; authorizationUrl: string }
  | { kind: 'starting'; reference: string }
  | { kind: 'new'; reference: string; amountKobo: number };

interface ChargeSubject {
  bookingId: string;
  deliveryRequestId: string | null;
  amountKobo: number;
}

/** The subject's `initiated` charge, or a new one recorded for its amount. */
async function openOrRecordCharge(
  trx: Transaction<DB>,
  subject: ChargeSubject,
): Promise<OpenCharge> {
  const charges = trx
    .selectFrom('payments')
    .select([
      'provider_ref',
      sql<string | null>`paystack_payload ->> 'authorization_url'`.as('authorization_url'),
    ])
    .where('booking_id', '=', subject.bookingId)
    .where('status', '=', 'initiated');
  const open = await (
    subject.deliveryRequestId === null
      ? charges.where('purpose', '=', 'booking_deposit')
      : charges
          .where('purpose', '=', 'delivery_fee')
          .where('delivery_request_id', '=', subject.deliveryRequestId)
  ).executeTakeFirst();
  if (open !== undefined) {
    return open.authorization_url === null
      ? { kind: 'starting', reference: open.provider_ref }
      : { kind: 'ready', reference: open.provider_ref, authorizationUrl: open.authorization_url };
  }

  const reference = generatePaymentReference('charge');
  await trx
    .insertInto('payments')
    .values({
      booking_id: subject.bookingId,
      delivery_request_id: subject.deliveryRequestId,
      provider_ref: reference,
      purpose: subject.deliveryRequestId === null ? 'booking_deposit' : 'delivery_fee',
      amount_kobo: subject.amountKobo,
      status: 'initiated',
    })
    .execute();
  return { kind: 'new', reference, amountKobo: subject.amountKobo };
}

async function lockBookingDates(trx: Transaction<DB>, bookingId: string) {
  const booking = await trx
    .selectFrom('bookings')
    .select(['status', 'start_date', 'end_date'])
    .where('id', '=', bookingId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  return { ...booking, status: booking.status as BookingStatus };
}

/**
 * Finds the delivery's open charge, or records a new one for its fee, under its booking's lock and
 * then its own (decision 143). Only the farmer's own unpaid `requested` delivery can be paid, while
 * its booking takes it and its day is inside the window.
 */
function openDeliveryCharge(
  db: Database,
  payer: Payer,
  deliveryRequestId: string,
  now: Date,
): Promise<OpenCharge> {
  return inTransaction(db, async (trx) => {
    const owned = await trx
      .selectFrom('delivery_requests')
      .select('context_id')
      .where('id', '=', deliveryRequestId)
      .where('requested_by', '=', payer.id)
      .where('context_type', 'in', Object.values(contextTypeFor))
      .executeTakeFirst();
    if (owned === undefined) throw new AppError('not_found', 'Delivery not found');
    const booking = await lockBookingDates(trx, owned.context_id);
    const delivery = await lockDelivery(trx, deliveryRequestId);
    const details = { delivery_request_id: deliveryRequestId, status: delivery.status };
    if (delivery.status !== 'requested' || delivery.paid_at !== null) {
      throw new AppError('conflict', 'This delivery is not awaiting payment', details);
    }
    const direction = directionOf(delivery.context_type);
    if (!isStillPayable(direction, delivery.scheduled_for, booking, now)) {
      throw new AppError('conflict', 'This delivery can no longer be paid for', {
        ...details,
        booking_status: booking.status,
      });
    }
    return openOrRecordCharge(trx, {
      bookingId: owned.context_id,
      deliveryRequestId,
      amountKobo: delivery.fee_kobo,
    });
  });
}

/**
 * Finds the booking's open charge, or records a new `initiated` one, under the booking's row lock,
 * so two calls at once never make two charges.
 */
function openBookingCharge(db: Database, payer: Payer, bookingId: string): Promise<OpenCharge> {
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

    return openOrRecordCharge(trx, {
      bookingId,
      deliveryRequestId: null,
      amountKobo: booking.total_charged_online_kobo,
    });
  });
}

/**
 * Starts the farmer's payment, for their `payment_pending` booking while its hold lasts (for the
 * booking's own online total) or for a delivery they requested after booking (for its fee), and
 * returns Paystack's checkout page. Calling again while that charge is open returns the same page
 * (decision 92).
 */
export async function startCharge(
  { db, gateway, appConfig, config, now = () => new Date() }: ChargeDependencies,
  payer: Payer,
  target: ChargeTarget,
): Promise<StartedCharge> {
  const { paystack_channels } = await appConfig.get();
  const charge =
    'bookingId' in target
      ? await openBookingCharge(db, payer, target.bookingId)
      : await openDeliveryCharge(db, payer, target.deliveryRequestId, now());
  if (charge.kind === 'ready') return charge;
  if (charge.kind === 'starting') {
    const details =
      'bookingId' in target
        ? { booking_id: target.bookingId }
        : { delivery_request_id: target.deliveryRequestId };
    throw new AppError(
      'conflict',
      'The payment is still being set up. Try again shortly.',
      details,
    );
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
  /** A delivery's own charge, paid while the delivery could still take it; no booking change. */
  | { kind: 'delivery_paid'; bookingId: string; deliveryRequestId: string }
  /**
   * Paid, but the booking, or the delivery when it is set, could no longer take it; the charge is
   * refunded in full.
   */
  | {
      kind: 'late';
      bookingId: string;
      bookingStatus: BookingStatus;
      deliveryRequestId?: string;
    };

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
  { db, appConfig, hooks, now = () => new Date() }: SettleDependencies,
  charge: GatewayCharge,
): Promise<ChargeOutcome> {
  const { provider_response_minutes } = await appConfig.get();
  return inTransaction(db, async (trx) => {
    const found = await trx
      .selectFrom('payments')
      .innerJoin('bookings', 'bookings.id', 'payments.booking_id')
      .select([
        'payments.id',
        'payments.booking_id',
        'payments.delivery_request_id',
        'bookings.provider_id',
      ])
      .where('payments.provider_ref', '=', charge.reference)
      .where('payments.purpose', 'in', ['booking_deposit', 'delivery_fee'])
      .executeTakeFirst();
    if (found === undefined) return { kind: 'unknown' };
    if (found.delivery_request_id !== null) {
      const deliveryCharge = {
        id: found.id,
        bookingId: found.booking_id,
        deliveryRequestId: found.delivery_request_id,
      };
      return confirmDeliveryCharge(trx, deliveryCharge, charge, now());
    }
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

/**
 * Records a paid delivery charge, once, with no booking transition (decision 143). Locks the
 * booking, then the charge, then the delivery, the order every delivery path takes. A delivery that
 * was cancelled meanwhile, or whose booking or day no longer allows it, is a late payment
 * (decision 94): the charge is kept as paid and refunded in full.
 */
async function confirmDeliveryCharge(
  trx: Transaction<DB>,
  found: { id: string; bookingId: string; deliveryRequestId: string },
  charge: GatewayCharge,
  now: Date,
): Promise<ChargeOutcome> {
  const { bookingId, deliveryRequestId } = found;
  const booking = await lockBookingDates(trx, bookingId);
  const payment = await trx
    .selectFrom('payments')
    .select('status')
    .where('id', '=', found.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (payment.status !== 'initiated') return { kind: 'already_confirmed', bookingId };

  const delivery = await lockDelivery(trx, deliveryRequestId);
  if (charge.amountKobo !== delivery.fee_kobo || charge.currency !== 'NGN') {
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

  const payable =
    delivery.status === 'requested' &&
    delivery.paid_at === null &&
    isStillPayable(directionOf(delivery.context_type), delivery.scheduled_for, booking, now);
  if (!payable) {
    return { kind: 'late', bookingId, bookingStatus: booking.status, deliveryRequestId };
  }
  await trx
    .updateTable('delivery_requests')
    .set({ paid_at: sql<Date>`now()` })
    .where('id', '=', deliveryRequestId)
    .execute();
  return { kind: 'delivery_paid', bookingId, deliveryRequestId };
}

export interface SettledCharge {
  outcome: ChargeOutcome;
  /** The work that must wait for the commit: the transition's hooks, or a late charge's refund. */
  afterCommit: () => Promise<void>;
}

/** What confirming a paid charge needs: the web app's address is only for starting one. */
export type SettleDependencies = Omit<ChargeDependencies, 'config'> & { logger: Logger };

/** Confirms a paid charge in one transaction; the caller runs `afterCommit` once it returns. */
export async function settleCharge(
  deps: SettleDependencies,
  charge: GatewayCharge,
): Promise<SettledCharge> {
  const outcome = await confirmCharge(deps, charge);
  const log = { reference: maskReference(charge.reference) };
  switch (outcome.kind) {
    case 'confirmed':
      return { outcome, afterCommit: () => runAfterCommitHooks(deps.logger, outcome.transition) };
    case 'delivery_paid':
      deps.logger.info(
        { ...log, bookingId: outcome.bookingId, deliveryRequestId: outcome.deliveryRequestId },
        'Delivery fee paid',
      );
      return { outcome, afterCommit: () => Promise.resolve() };
    case 'late': {
      const { bookingId, bookingStatus, deliveryRequestId } = outcome;
      const subject = deliveryRequestId === undefined ? {} : { deliveryRequestId };
      deps.logger.warn(
        { ...log, bookingId, bookingStatus, ...subject },
        deliveryRequestId === undefined
          ? 'Late payment for a booking that can no longer take it; refunding in full'
          : 'Late payment for a delivery that can no longer take it; refunding in full',
      );
      return {
        outcome,
        afterCommit: async () => {
          await refundBooking(deps, {
            bookingId,
            ...subject,
            amount: 'full',
            reason: 'late_payment',
          });
        },
      };
    }
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
