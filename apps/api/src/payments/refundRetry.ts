import { sql, type Transaction } from 'kysely';
import type { Logger } from 'pino';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { inTransaction } from '../db/transaction.js';
import { maskReference, type GatewayRefund, type PaymentGateway } from './gateway.js';
import { recordRefundSuccess } from './refunds.js';
import { mergePayload } from './store.js';

/**
 * Retries a failed refund gets after the hook's own attempt. Every five minutes, that is about
 * half an hour: long enough for a Paystack outage to pass, short enough that the farmer is not
 * left waiting on a refund that needs a person.
 */
export const MAX_REFUND_RETRIES = 6;

/** How many failed refunds one run retries; each holds its row while it waits on Paystack. */
export const REFUND_RETRY_BATCH_SIZE = 10;

// The refund's row is written just before Paystack is asked, so any refund Paystack made for it
// was created after this much before the row.
const LOOKUP_MARGIN_MS = 60 * 60 * 1000;

const retries = sql<number>`coalesce((paystack_payload ->> 'retry_attempts')::int, 0)`;

export interface RefundRetryDependencies {
  db: Database;
  gateway: PaymentGateway;
  logger: Logger;
}

export type RefundRetryOutcome = 'refunded' | 'found' | 'failed' | 'needs_attention';

async function claimFailedRefund(trx: Transaction<DB>, skip: readonly string[]) {
  return trx
    .selectFrom('payments')
    .select([
      'id',
      'booking_id',
      'provider_ref',
      'amount_kobo',
      'created_at',
      sql<string>`paystack_payload ->> 'charge_reference'`.as('charge_reference'),
      retries.as('retry_attempts'),
    ])
    .where('purpose', '=', 'refund')
    .where('status', '=', 'failed')
    .where(retries, '<', MAX_REFUND_RETRIES)
    .$if(skip.length > 0, (query) => query.where('id', 'not in', skip))
    .orderBy('created_at')
    .limit(1)
    .forUpdate()
    .skipLocked()
    .executeTakeFirst();
}

type FailedRefund = NonNullable<Awaited<ReturnType<typeof claimFailedRefund>>>;

function chargeOf(trx: Transaction<DB>, refund: FailedRefund) {
  return trx
    .selectFrom('payments')
    .select([
      'id',
      'amount_kobo',
      sql<string | null>`paystack_payload -> 'charge' ->> 'id'`.as('transaction_id'),
    ])
    .where('provider_ref', '=', refund.charge_reference)
    .where('purpose', '=', 'booking_deposit')
    .executeTakeFirstOrThrow();
}

/**
 * Resends one failed refund, or records the refund Paystack already made for it. A failed call
 * may still have reached Paystack (a timeout, say), so Paystack's refunds for the charge are read
 * first and a resend happens only when none of them stands. The same row is retried, never a new
 * one (decision 95), and its row lock is held throughout so no other worker retries it meanwhile.
 */
async function retryRefund(
  { gateway, logger }: RefundRetryDependencies,
  trx: Transaction<DB>,
  refund: FailedRefund,
): Promise<RefundRetryOutcome> {
  const charge = await chargeOf(trx, refund);
  const record = {
    id: refund.id,
    amountKobo: refund.amount_kobo,
    charge: { id: charge.id, amountKobo: charge.amount_kobo },
  };
  const log = { bookingId: refund.booking_id, reference: maskReference(refund.provider_ref) };

  let made: GatewayRefund;
  let outcome: 'refunded' | 'found';
  try {
    const existing = await gateway.listRefunds({
      chargeReference: refund.charge_reference,
      transactionId: charge.transaction_id,
      since: new Date(refund.created_at.getTime() - LOOKUP_MARGIN_MS),
    });
    const standing = existing.find((candidate) => candidate.status !== 'failed');
    if (standing === undefined) {
      made = await gateway.refund({
        chargeReference: refund.charge_reference,
        amountKobo: refund.amount_kobo,
      });
      outcome = 'refunded';
    } else {
      made = standing;
      outcome = 'found';
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    const attempts = refund.retry_attempts + 1;
    await trx
      .updateTable('payments')
      .set({ paystack_payload: mergePayload({ error, retry_attempts: attempts }) })
      .where('id', '=', refund.id)
      .execute();
    if (attempts >= MAX_REFUND_RETRIES) {
      logger.error({ ...log, error, attempts }, 'Refund needs attention');
      return 'needs_attention';
    }
    logger.warn({ ...log, error, attempts }, 'Paystack refund retry failed');
    return 'failed';
  }

  await recordRefundSuccess(trx, record, made);
  logger.info(
    { ...log, amountKobo: refund.amount_kobo, outcome },
    outcome === 'found' ? 'Refund found at Paystack and recorded' : 'Refund made on retry',
  );
  return outcome;
}

/** Retries the failed refunds, oldest first, each in a transaction of its own. */
export async function retryFailedRefunds(
  deps: RefundRetryDependencies,
  limit = REFUND_RETRY_BATCH_SIZE,
): Promise<Record<RefundRetryOutcome, number>> {
  const counts: Record<RefundRetryOutcome, number> = {
    refunded: 0,
    found: 0,
    failed: 0,
    needs_attention: 0,
  };
  const tried: string[] = [];
  while (tried.length < limit) {
    const outcome = await inTransaction(deps.db, async (trx) => {
      const refund = await claimFailedRefund(trx, tried);
      if (refund === undefined) return undefined;
      tried.push(refund.id);
      return retryRefund(deps, trx, refund);
    });
    if (outcome === undefined) break;
    counts[outcome] += 1;
  }
  return counts;
}
