import { createHash, randomBytes } from 'node:crypto';
import type { ActionTokenPurpose } from '@coldlink/shared';
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';

// 256 bits, written as 43 base64url characters so the link stays short in an SMS.
const TOKEN_BYTES = 32;
const TOKEN_LIFETIME_HOURS = 12;
const PROVIDER_PURPOSE = 'provider_respond_booking';
const DELIVERY_PURPOSES = ['delivery_accept', 'delivery_update'] as const;

export type DeliveryTokenPurpose = (typeof DELIVERY_PURPOSES)[number];

/** Only this hash is stored, so a copy of the table cannot be used to act on a booking. */
export function hashActionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function insertToken(
  trx: Transaction<DB>,
  purpose: ActionTokenPurpose,
  subjectId: string,
  expiresAt: Date | ReturnType<typeof sql<Date>>,
): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  await trx
    .insertInto('action_tokens')
    .values({
      token_hash: hashActionToken(token),
      purpose,
      subject_id: subjectId,
      expires_at: expiresAt,
    })
    .execute();
  return token;
}

/**
 * Issues the single-use link token with which the booking's provider accepts or rejects it without
 * signing in (PRD 5.13, 7.6), valid for 12 hours on the database's clock. The raw token is
 * returned once and never stored. The SMS that carries it is #29's.
 */
export function issueProviderActionToken(trx: Transaction<DB>, bookingId: string): Promise<string> {
  return insertToken(
    trx,
    PROVIDER_PURPOSE,
    bookingId,
    sql<Date>`now() + make_interval(hours => ${TOKEN_LIFETIME_HOURS}::int)`,
  );
}

/**
 * Issues a delivery partner's link token for the delivery, valid until `expiresAt` (decision 149).
 * As for the provider's, the raw token is returned once and only its hash is stored.
 */
export function issueDeliveryToken(
  trx: Transaction<DB>,
  deliveryId: string,
  purpose: DeliveryTokenPurpose,
  expiresAt: Date,
): Promise<string> {
  return insertToken(trx, purpose, deliveryId, expiresAt);
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

// statement_timestamp(), not now(): a link's transaction may start before a reassignment that
// revokes its token commits, and then reads it under the lock. now() would still be the earlier
// time and the revoked token would pass; each statement's own start time does not.
function usableDeliveryTokens(db: Database, token: string) {
  return db
    .selectFrom('action_tokens')
    .select(['id', 'subject_id as deliveryId', 'purpose'])
    .where('token_hash', '=', hashActionToken(token))
    .where('purpose', 'in', DELIVERY_PURPOSES)
    .where('used_at', 'is', null)
    .where('expires_at', '>', sql<Date>`statement_timestamp()`);
}

export interface UsableDeliveryToken {
  id: string;
  deliveryId: string;
  purpose: DeliveryTokenPurpose;
}

function asDeliveryToken(
  row: { id: string; deliveryId: string; purpose: string } | undefined,
): UsableDeliveryToken | undefined {
  if (row === undefined) return undefined;
  const purpose = DELIVERY_PURPOSES.find((known) => known === row.purpose);
  if (purpose === undefined) throw new Error(`Not a delivery token purpose: ${row.purpose}`);
  return { ...row, purpose };
}

/** The delivery an unused, unexpired, unrevoked partner token is for; undefined otherwise. */
export async function findDeliveryToken(
  db: Database,
  token: string,
): Promise<UsableDeliveryToken | undefined> {
  return asDeliveryToken(await usableDeliveryTokens(db, token).executeTakeFirst());
}

/**
 * As findDeliveryToken, locking the token. Delivery links lock the booking, then the delivery,
 * then the token, the order the assignment takes too, so a link racing a reassignment, a
 * cancellation or a second tap waits and then sees what they did.
 */
export async function lockDeliveryToken(
  trx: Transaction<DB>,
  token: string,
): Promise<UsableDeliveryToken | undefined> {
  return asDeliveryToken(await usableDeliveryTokens(trx, token).forUpdate().executeTakeFirst());
}

/**
 * Ends every usable partner token of the delivery, as a reassignment does to the old partner's
 * link (decision 149). Expiring them keeps `used_at` for tokens that were actually used.
 */
export async function revokeDeliveryTokens(
  trx: Transaction<DB>,
  deliveryId: string,
): Promise<void> {
  await trx
    .updateTable('action_tokens')
    .set({ expires_at: sql<Date>`statement_timestamp()` })
    .where('subject_id', '=', deliveryId)
    .where('purpose', 'in', DELIVERY_PURPOSES)
    .where('used_at', 'is', null)
    .where('expires_at', '>', sql<Date>`statement_timestamp()`)
    .execute();
}

export async function markTokenUsed(trx: Transaction<DB>, tokenId: string): Promise<void> {
  await trx
    .updateTable('action_tokens')
    .set({ used_at: sql<Date>`now()` })
    .where('id', '=', tokenId)
    .executeTakeFirstOrThrow();
}
