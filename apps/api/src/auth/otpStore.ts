import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import { MAX_OTP_ATTEMPTS, OTP_TTL_MINUTES } from './otp.js';
import { OTP_HISTORY_ROWS, OTP_HISTORY_SECONDS, otpRetryAfterSeconds } from './otpLimits.js';

export type IssueOtpResult =
  { status: 'issued' } | { status: 'limited'; retryAfterSeconds: number };

export interface LiveOtp {
  id: string;
  codeHash: string;
}

// The database clock, which created_at uses, so instances with skewed clocks agree. With no
// recent codes there is nothing to limit, so no clock is needed.
async function retryAfterSeconds(db: Database, phone: string): Promise<number | undefined> {
  const rows = await db
    .selectFrom('otp_codes')
    .select(['created_at', sql<Date>`now()`.as('now')])
    .where('phone', '=', phone)
    .where('created_at', '>', sql<Date>`now() - make_interval(secs => ${OTP_HISTORY_SECONDS})`)
    .orderBy('created_at', 'desc')
    .limit(OTP_HISTORY_ROWS)
    .execute();
  const now = rows[0]?.now;
  if (now === undefined) return undefined;
  return otpRetryAfterSeconds(
    rows.map((row) => row.created_at),
    now,
  );
}

/**
 * Stores a new code for the number unless a per-phone limit is reached, and makes any earlier
 * unconsumed code unusable. A per-phone advisory lock serialises concurrent requests, so two
 * at once cannot both slip under a limit.
 */
export function issueOtp(db: Database, phone: string, codeHash: string): Promise<IssueOtpResult> {
  return inTransaction(db, async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`otp:${phone}`}, 0))`.execute(trx);
    const wait = await retryAfterSeconds(trx, phone);
    if (wait !== undefined) return { status: 'limited', retryAfterSeconds: wait };
    await trx
      .updateTable('otp_codes')
      .set({ expires_at: sql<Date>`now()` })
      .where('phone', '=', phone)
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', sql<Date>`now()`)
      .execute();
    await trx
      .insertInto('otp_codes')
      .values({
        phone,
        code_hash: codeHash,
        expires_at: sql<Date>`now() + make_interval(mins => ${OTP_TTL_MINUTES})`,
      })
      .execute();
    return { status: 'issued' };
  });
}

/** The latest code for the number that is unconsumed, unexpired and has guesses left, locked. */
export async function findLiveOtp(trx: Database, phone: string): Promise<LiveOtp | undefined> {
  const row = await trx
    .selectFrom('otp_codes')
    .select(['id', 'code_hash'])
    .where('phone', '=', phone)
    .where('consumed_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`)
    .where('attempts', '<', MAX_OTP_ATTEMPTS)
    .orderBy('created_at', 'desc')
    .limit(1)
    .forUpdate()
    .executeTakeFirst();
  return row === undefined ? undefined : { id: row.id, codeHash: row.code_hash };
}

export async function recordWrongGuess(trx: Database, otpId: string): Promise<void> {
  await trx
    .updateTable('otp_codes')
    .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
    .where('id', '=', otpId)
    .execute();
}

export async function consumeOtp(trx: Database, otpId: string): Promise<void> {
  await trx
    .updateTable('otp_codes')
    .set({ consumed_at: sql<Date>`now()` })
    .where('id', '=', otpId)
    .execute();
}
