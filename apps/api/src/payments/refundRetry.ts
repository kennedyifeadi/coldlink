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

// A call that timed out here can still be finishing at Paystack, and until it does the lookup
// would not see its refund.
const SETTLE_SECONDS = 60;

const retries = sql<number>`coalesce((paystack_payload ->> 'retry_attempts')::int, 0)`;

export interface RefundRetryDependencies {
  db: Database;
  gateway: PaymentGateway;
  logger: Logger;
  /** Set while shutting down: the row in hand finishes and no other is started. */
  signal?: AbortSignal | undefined;
}

export type RefundRetryOutcome = 'refunded' | 'found' | 'failed' | 'needs_attention';

async function claimFailedRefund(trx: Transaction<DB>, skip: readonly string[]) {
  return trx
    .selectFrom('payments')
    .select([
      'id',
      'booking_id',
      'delivery_request_id',
      'provider_ref',
      'amount_kobo',
      sql<string>`paystack_payload ->> 'charge_reference'`.as('charge_reference'),
      retries.as('retry_attempts'),
    ])
    .where('purpose', '=', 'refund')
    .where('status', '=', 'failed')
    .where(retries, '<', MAX_REFUND_RETRIES)
    .where('updated_at', '<=', sql<Date>`now() - make_interval(secs => ${SETTLE_SECONDS})`)
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
    .where('purpose', 'in', ['booking_deposit', 'delivery_fee'])
    .executeTakeFirstOrThrow();
}

/** The Paystack refunds other rows already record for the charge, which this one cannot be. */
async function recordedRefundIds(trx: Transaction<DB>, refund: FailedRefund): Promise<Set<string>> {
  const rows = await trx
    .selectFrom('payments')
    .select(sql<string | null>`paystack_payload ->> 'paystack_refund_id'`.as('refund_id'))
    .where('purpose', '=', 'refund')
    .where('id', '!=', refund.id)
    .where(sql<string>`paystack_payload ->> 'charge_reference'`, '=', refund.charge_reference)
    .execute();
  return new Set(rows.flatMap((row) => (row.refund_id === null ? [] : [row.refund_id])));
}

/**
 * Resends one failed refund, or records the refund Paystack already made for it. A failed call
 * may still have reached Paystack (a timeout, say), so Paystack's refunds for the charge are read
 * first and a resend happens only when none of them stands; without the charge's id they cannot
 * be read, so nothing is sent. A standing refund of another amount is recorded at the amount
 * Paystack made and raised for an admin. The same row is retried, never a new one (decision 95),
 * and its row lock is held throughout so no other worker retries it meanwhile.
 */
async function retryRefund(
  { gateway, logger }: RefundRetryDependencies,
  trx: Transaction<DB>,
  refund: FailedRefund,
): Promise<RefundRetryOutcome> {
  const log = {
    bookingId: refund.booking_id,
    deliveryRequestId: refund.delivery_request_id,
    reference: maskReference(refund.provider_ref),
  };

  let charge: Awaited<ReturnType<typeof chargeOf>>;
  let made: GatewayRefund;
  let amountKobo = refund.amount_kobo;
  let outcome: 'refunded' | 'found';
  try {
    charge = await chargeOf(trx, refund);
    if (charge.transaction_id === null) {
      throw new Error('The charge has no Paystack id to look its refunds up by');
    }
    // A charge can carry a delivery's refund as well as its booking's (decision 144).
    const recorded = await recordedRefundIds(trx, refund);
    const standing = (
      await gateway.listRefunds({
        chargeReference: refund.charge_reference,
        transactionId: charge.transaction_id,
      })
    ).filter((candidate) => candidate.status !== 'failed' && !recorded.has(candidate.refundId));
    const existing =
      standing.find((candidate) => candidate.amountKobo === amountKobo) ?? standing[0];
    if (existing === undefined) {
      made = await gateway.refund({ chargeReference: refund.charge_reference, amountKobo });
      outcome = 'refunded';
    } else {
      made = existing;
      amountKobo = existing.amountKobo;
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

  // The amount Paystack made goes on the row first: the charge's status is worked out from it.
  const otherAmount = amountKobo !== refund.amount_kobo;
  if (otherAmount) {
    await trx
      .updateTable('payments')
      .set({
        amount_kobo: amountKobo,
        paystack_payload: mergePayload({ requested_amount_kobo: refund.amount_kobo }),
      })
      .where('id', '=', refund.id)
      .execute();
  }
  await recordRefundSuccess(
    trx,
    {
      id: refund.id,
      amountKobo,
      charge: { id: charge.id, reference: refund.charge_reference, amountKobo: charge.amount_kobo },
    },
    made,
  );
  if (otherAmount) {
    logger.error(
      { ...log, amountKobo, requestedAmountKobo: refund.amount_kobo },
      'Refund needs attention',
    );
    return 'needs_attention';
  }
  logger.info(
    { ...log, amountKobo, outcome },
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
  while (!deps.signal?.aborted && tried.length < limit) {
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
