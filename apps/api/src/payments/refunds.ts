import { sql, type Transaction } from 'kysely';
import type { Logger } from 'pino';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { inTransaction } from '../db/transaction.js';
import { maskReference, type GatewayRefund, type PaymentGateway } from './gateway.js';
import { generatePaymentReference, mergePayload } from './store.js';

export interface RefundDependencies {
  db: Database;
  gateway: PaymentGateway;
  logger: Logger;
}

export type RefundReason =
  | 'farmer_cancelled'
  | 'cancelled'
  | 'rejected'
  | 'provider_timeout'
  | 'late_payment'
  | 'delivery_cancelled';

export interface RefundOrder {
  bookingId: string;
  /** Set to refund one delivery's fee rather than the booking (decision 144). */
  deliveryRequestId?: string;
  /**
   * Kobo to refund; the whole charge; or the booking's own part of its charge, which leaves out
   * the fee of a delivery paid with it, since each delivery refunds its own fee.
   */
  amount: number | 'full' | 'booking_part';
  reason: RefundReason;
}

type NoRefund = 'already_refunded' | 'nothing_to_refund';

export type RefundOutcome = 'refunded' | 'failed' | NoRefund;

interface PaidCharge {
  id: string;
  reference: string;
  amountKobo: number;
}

interface StartedRefund {
  id: string;
  reference: string;
  amountKobo: number;
  charge: PaidCharge;
}

const paidStatuses = ['success', 'partially_refunded', 'refunded'];

const chargeReference = sql<string>`paystack_payload ->> 'charge_reference'`;

/**
 * The charge a refund goes against, locked: a delivery's own `delivery_fee` charge if it was paid
 * separately, and otherwise the booking's charge, which a delivery requested with the booking was
 * paid in.
 */
async function lockPaidCharge(
  trx: Transaction<DB>,
  order: RefundOrder,
): Promise<PaidCharge | undefined> {
  const charges = trx
    .selectFrom('payments')
    .select(['id', 'provider_ref', 'amount_kobo'])
    .where('status', 'in', paidStatuses)
    .forUpdate();
  const own =
    order.deliveryRequestId === undefined
      ? undefined
      : await charges
          .where('purpose', '=', 'delivery_fee')
          .where('delivery_request_id', '=', order.deliveryRequestId)
          .executeTakeFirst();
  const charge =
    own ??
    (await charges
      .where('purpose', '=', 'booking_deposit')
      .where('booking_id', '=', order.bookingId)
      .executeTakeFirst());
  return (
    charge && { id: charge.id, reference: charge.provider_ref, amountKobo: charge.amount_kobo }
  );
}

async function sumRefunds(
  trx: Transaction<DB>,
  reference: string,
  statuses?: readonly string[],
): Promise<number> {
  const { total } = await trx
    .selectFrom('payments')
    .select(sql<string>`coalesce(sum(amount_kobo), 0)`.as('total'))
    .where('purpose', '=', 'refund')
    .where(chargeReference, '=', reference)
    .$if(statuses !== undefined, (query) => query.where('status', 'in', statuses ?? []))
    .executeTakeFirstOrThrow();
  return Number(total);
}

async function amountFor(
  trx: Transaction<DB>,
  order: RefundOrder,
  charge: PaidCharge,
): Promise<number> {
  if (typeof order.amount === 'number') return order.amount;
  if (order.amount === 'full') return charge.amountKobo;
  const { delivery_fee_kobo } = await trx
    .selectFrom('bookings')
    .select('delivery_fee_kobo')
    .where('id', '=', order.bookingId)
    .executeTakeFirstOrThrow();
  return charge.amountKobo - delivery_fee_kobo;
}

function earlierRefund(trx: Transaction<DB>, order: RefundOrder) {
  const refunds = trx.selectFrom('payments').select('id').where('purpose', '=', 'refund');
  return order.deliveryRequestId === undefined
    ? refunds.where('booking_id', '=', order.bookingId).where('delivery_request_id', 'is', null)
    : refunds.where('delivery_request_id', '=', order.deliveryRequestId);
}

/**
 * Records the refund as `initiated` before Paystack is asked, so a crash after the call leaves a
 * row to reconcile rather than a refund nobody knows about. A booking gets one refund row, and so
 * does each delivery: a second order does nothing, whatever became of the first. A refund never
 * takes a charge past what is left of it, counting refunds still being retried.
 */
async function startRefund(db: Database, order: RefundOrder): Promise<StartedRefund | NoRefund> {
  return inTransaction(db, async (trx) => {
    const charge = await lockPaidCharge(trx, order);
    // A failed refund is the retry job's to resend (#30), so it counts too.
    if ((await earlierRefund(trx, order).executeTakeFirst()) !== undefined) {
      return 'already_refunded';
    }
    const subject = order.deliveryRequestId ?? order.bookingId;
    if (charge === undefined) throw new Error(`${subject} has no successful payment to refund`);

    const amountKobo = await amountFor(trx, order, charge);
    if (amountKobo === 0) return 'nothing_to_refund';
    if (amountKobo > charge.amountKobo - (await sumRefunds(trx, charge.reference))) {
      throw new Error(`Refund for ${subject} is more than is left of its charge`);
    }
    const reference = generatePaymentReference('refund');
    const { id } = await trx
      .insertInto('payments')
      .values({
        booking_id: order.bookingId,
        delivery_request_id: order.deliveryRequestId ?? null,
        provider_ref: reference,
        purpose: 'refund',
        amount_kobo: amountKobo,
        status: 'initiated',
        paystack_payload: JSON.stringify({
          charge_reference: charge.reference,
          reason: order.reason,
        }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id, reference, amountKobo, charge };
  });
}

export interface RefundRecord {
  /** The refund's `payments` row. */
  id: string;
  amountKobo: number;
  charge: { id: string; reference: string; amountKobo: number };
}

/**
 * Marks the refund `success` with the gateway's refund, and its charge `refunded` once its refunds
 * add up to all of it, or `partially_refunded` until then. A charge can carry several refunds: a
 * delivery's fee and then the rest of its booking.
 */
export async function recordRefundSuccess(
  trx: Transaction<DB>,
  refund: RefundRecord,
  result: GatewayRefund,
): Promise<void> {
  await trx
    .updateTable('payments')
    .set({
      status: 'success',
      paid_at: sql<Date>`now()`,
      paystack_payload: mergePayload({
        paystack_refund_id: result.refundId,
        paystack_status: result.status,
      }),
    })
    .where('id', '=', refund.id)
    .execute();
  const refunded = await sumRefunds(trx, refund.charge.reference, ['success']);
  await trx
    .updateTable('payments')
    .set({ status: refunded < refund.charge.amountKobo ? 'partially_refunded' : 'refunded' })
    .where('id', '=', refund.charge.id)
    .execute();
}

/**
 * Refunds a booking's charge, or one delivery's fee, through the gateway and records it as a
 * `refund` payment that ends `success` or `failed` (decisions 95, 144). A gateway failure is
 * recorded for the retry job and logged as the alert an admin acts on, never thrown.
 */
export async function refundBooking(
  { db, gateway, logger }: RefundDependencies,
  order: RefundOrder,
): Promise<RefundOutcome> {
  const refund = await startRefund(db, order);
  if (typeof refund === 'string') return refund;
  const log = {
    bookingId: order.bookingId,
    ...(order.deliveryRequestId === undefined
      ? {}
      : { deliveryRequestId: order.deliveryRequestId }),
    reference: maskReference(refund.reference),
  };

  let result;
  try {
    result = await gateway.refund({
      chargeReference: refund.charge.reference,
      amountKobo: refund.amountKobo,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    await db
      .updateTable('payments')
      .set({ status: 'failed', paystack_payload: mergePayload({ error }) })
      .where('id', '=', refund.id)
      .execute();
    logger.error({ ...log, error, reason: order.reason }, 'Paystack refund failed');
    return 'failed';
  }

  await inTransaction(db, (trx) => recordRefundSuccess(trx, refund, result));
  logger.info({ ...log, amountKobo: refund.amountKobo, reason: order.reason }, 'Refund made');
  return 'refunded';
}
