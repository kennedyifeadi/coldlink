import { createHash, randomBytes } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';

// 256 bits, written as 43 base64url characters so the link stays short in an SMS.
const TOKEN_BYTES = 32;
const TOKEN_LIFETIME_HOURS = 12;
const PROVIDER_PURPOSE = 'provider_respond_booking';

/** Only this hash is stored, so a copy of the table cannot be used to act on a booking. */
export function hashActionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issues the single-use link token with which the booking's provider accepts or rejects it without
 * signing in (PRD 5.13, 7.6), valid for 12 hours on the database's clock. The raw token is
 * returned once and never stored. The SMS that carries it is #29's.
 */
export async function issueProviderActionToken(
  trx: Transaction<DB>,
  bookingId: string,
): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  await trx
    .insertInto('action_tokens')
    .values({
      token_hash: hashActionToken(token),
      purpose: PROVIDER_PURPOSE,
      subject_id: bookingId,
      expires_at: sql<Date>`now() + make_interval(hours => ${TOKEN_LIFETIME_HOURS}::int)`,
    })
    .execute();
  return token;
}

function usableProviderTokens(db: Database, token: string) {
  return db
    .selectFrom('action_tokens')
    .select(['id', 'subject_id as bookingId'])
    .where('token_hash', '=', hashActionToken(token))
    .where('purpose', '=', PROVIDER_PURPOSE)
    .where('used_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`);
}

export interface UsableToken {
  id: string;
  bookingId: string;
}

/** The booking an unused, unexpired provider token is for; undefined in every other case. */
export function findProviderToken(db: Database, token: string): Promise<UsableToken | undefined> {
  return usableProviderTokens(db, token).executeTakeFirst();
}

/**
 * As findProviderToken, locking the token until the transaction ends, so a second use of the same
 * link waits and then finds it used.
 */
export function lockProviderToken(
  trx: Transaction<DB>,
  token: string,
): Promise<UsableToken | undefined> {
  return usableProviderTokens(trx, token).forUpdate().executeTakeFirst();
}

export async function markTokenUsed(trx: Transaction<DB>, tokenId: string): Promise<void> {
  await trx
    .updateTable('action_tokens')
    .set({ used_at: sql<Date>`now()` })
    .where('id', '=', tokenId)
    .executeTakeFirstOrThrow();
}
