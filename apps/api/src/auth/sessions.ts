import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import { generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_TTL_DAYS } from './tokens.js';

export type RotateResult =
  | { status: 'rotated'; userId: string; familyId: string; token: string }
  | { status: 'invalid' }
  /** A token that was already replaced came back: the family is now revoked. */
  | { status: 'reused'; userId: string };

async function insertToken(
  trx: Database,
  { userId, familyId, rotatedFromId }: { userId: string; familyId: string; rotatedFromId?: string },
): Promise<string> {
  const token = generateRefreshToken();
  await trx
    .insertInto('refresh_tokens')
    .values({
      user_id: userId,
      family_id: familyId,
      rotated_from_id: rotatedFromId ?? null,
      token_hash: hashRefreshToken(token),
      expires_at: sql<Date>`now() + make_interval(days => ${REFRESH_TOKEN_TTL_DAYS})`,
    })
    .execute();
  return token;
}

/** Starts a new token family for a sign-in and returns its first refresh token. */
export function startSession(trx: Database, userId: string): Promise<string> {
  return insertToken(trx, { userId, familyId: randomUUID() });
}

export async function revokeFamily(trx: Database, familyId: string): Promise<void> {
  await trx
    .updateTable('refresh_tokens')
    .set({ revoked_at: sql<Date>`now()` })
    .where('family_id', '=', familyId)
    .where('revoked_at', 'is', null)
    .execute();
}

/**
 * Swaps a live refresh token for a new one in the same family, with a fresh 30 days. A revoked
 * token that has already been replaced means someone holds a copy, so the family is revoked and
 * both holders have to sign in again. The row lock means two refreshes with one token cannot both
 * succeed; the second counts as reuse.
 */
export function rotateSession(db: Database, token: string): Promise<RotateResult> {
  return inTransaction(db, async (trx) => {
    const row = await trx
      .selectFrom('refresh_tokens')
      .select([
        'id',
        'user_id',
        'family_id',
        'revoked_at',
        sql<boolean>`expires_at > now()`.as('live'),
        (eb) =>
          eb
            .exists(
              eb
                .selectFrom('refresh_tokens as successor')
                .select('successor.id')
                .whereRef('successor.rotated_from_id', '=', 'refresh_tokens.id'),
            )
            .as('replaced'),
      ])
      .where('token_hash', '=', hashRefreshToken(token))
      .forUpdate()
      .executeTakeFirst();
    if (row === undefined) return { status: 'invalid' };
    if (row.revoked_at !== null) {
      await revokeFamily(trx, row.family_id);
      return row.replaced ? { status: 'reused', userId: row.user_id } : { status: 'invalid' };
    }
    if (!row.live) return { status: 'invalid' };
    await trx
      .updateTable('refresh_tokens')
      .set({ revoked_at: sql<Date>`now()` })
      .where('id', '=', row.id)
      .execute();
    const next = await insertToken(trx, {
      userId: row.user_id,
      familyId: row.family_id,
      rotatedFromId: row.id,
    });
    return { status: 'rotated', userId: row.user_id, familyId: row.family_id, token: next };
  });
}

/** Revokes the token's whole family, so the session ends on every copy. Unknown tokens are ignored. */
export async function revokeSession(db: Database, token: string): Promise<void> {
  const row = await db
    .selectFrom('refresh_tokens')
    .select('family_id')
    .where('token_hash', '=', hashRefreshToken(token))
    .executeTakeFirst();
  if (row !== undefined) await revokeFamily(db, row.family_id);
}
