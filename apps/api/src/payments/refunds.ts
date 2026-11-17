import { sql } from 'kysely';
import type { Logger } from 'pino';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import { maskReference, type PaymentGateway } from './gateway.js';
import { generatePaymentReference, mergePayload } from './store.js';

export interface RefundDependencies {
  db: Database;
  gateway: PaymentGateway;
  logger: Logger;
}

export type RefundReason =
  'farmer_cancelled' | 'cancelled' | 'rejected' | 'provider_timeout' | 'late_payment';

export interface RefundOrder {
  bookingId: string;
  /** Kobo to refund, or the whole charge. */
  amount: number | 'full';
  reason: RefundReason;
}

export type RefundOutcome = 'refunded' | 'failed' | 'already_refunded';

interface StartedRefund {
  id: string;
  reference: string;
  amountKobo: number;
  charge: { id: string; reference: string; amountKobo: number };
}

/**
 * Records the refund as `initiated` before Paystack is asked, so a crash after the call leaves a
 * row to reconcile rather than a refund nobody knows about. A booking gets one refund row: a
 * second order does nothing, whatever became of the first.
 */
async function startRefund(db: Database, order: RefundOrder): Promise<StartedRefund | undefined> {
  return inTransaction(db, async (trx) => {
    const charge = await trx
      .selectFrom('payments')
      .select(['id', 'provider_ref', 'amount_kobo'])
      .where('booking_id', '=', order.bookingId)
      .where('purpose', '=', 'booking_deposit')
      .where('status', '=', 'success')
      .forUpdate()
      .executeTakeFirst();
    // A failed refund is the retry job's to resend (#30), so it counts too.
    const earlier = await trx
      .selectFrom('payments')
      .select('id')
      .where('booking_id', '=', order.bookingId)
      .where('purpose', '=', 'refund')
      .executeTakeFirst();
    if (earlier !== undefined) return undefined;
    if (charge === undefined) {
      throw new Error(`Booking ${order.bookingId} has no successful payment to refund`);
    }
    const amountKobo = order.amount === 'full' ? charge.amount_kobo : order.amount;
    if (amountKobo > charge.amount_kobo) {
      throw new Error(`Refund for booking ${order.bookingId} is more than was paid`);
    }
    const reference = generatePaymentReference('refund');
    const { id } = await trx
      .insertInto('payments')
      .values({
        booking_id: order.bookingId,
        provider_ref: reference,
        purpose: 'refund',
        amount_kobo: amountKobo,
        status: 'initiated',
        paystack_payload: JSON.stringify({
          charge_reference: charge.provider_ref,
          reason: order.reason,
        }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return {
      id,
      reference,
      amountKobo,
      charge: { id: charge.id, reference: charge.provider_ref, amountKobo: charge.amount_kobo },
    };
  });
}

/**
 * Refunds a booking's charge through the gateway and records it as a `refund` payment that ends
 * `success` or `failed` (decision 95). A gateway failure is recorded for the retry job and logged,
 * never thrown; the charge becomes `refunded`, or `partially_refunded` for less than all of it.
 */
export async function refundBooking(
  { db, gateway, logger }: RefundDependencies,
  order: RefundOrder,
): Promise<RefundOutcome> {
  const refund = await startRefund(db, order);
  if (refund === undefined) return 'already_refunded';
  const log = { bookingId: order.bookingId, reference: maskReference(refund.reference) };

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

  await inTransaction(db, async (trx) => {
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
    await trx
      .updateTable('payments')
      .set({
        status: refund.amountKobo < refund.charge.amountKobo ? 'partially_refunded' : 'refunded',
      })
      .where('id', '=', refund.charge.id)
      .execute();
  });
  logger.info({ ...log, amountKobo: refund.amountKobo, reason: order.reason }, 'Refund made');
  return 'refunded';
}
