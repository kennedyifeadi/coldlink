import { randomInt } from 'node:crypto';
import {
  maskPhone,
  preferredChannelSchema,
  userRoleSchema,
  type UpdateProfileChanges,
  type UserProfile,
} from '@coldlink/shared';
import { sql, type Selectable } from 'kysely';
import * as z from 'zod';
import type { Database } from '../db/client.js';
import type { Users } from '../db/schema.js';

export type UserRow = Selectable<Users>;

export interface User extends Omit<UserRow, 'roles' | 'preferred_channel' | 'updated_at'> {
  roles: z.infer<typeof userRoleSchema>[];
  preferred_channel: z.infer<typeof preferredChannelSchema>;
}

const COLDLINK_ID_ATTEMPTS = 5;

const userColumns = [
  'id',
  'phone',
  'coldlink_id',
  'full_name',
  'roles',
  'preferred_channel',
  'home_lga',
  'home_lat',
  'home_lng',
  'consented_at',
  'last_login_at',
  'is_active',
  'created_at',
] as const;

// The database checks hold these to the same values; parsing narrows the text columns' types.
function toUser(row: Omit<UserRow, 'updated_at'>): User {
  return {
    ...row,
    roles: z.array(userRoleSchema).parse(row.roles),
    preferred_channel: preferredChannelSchema.parse(row.preferred_channel),
  };
}

export async function findUserByPhone(db: Database, phone: string): Promise<User | undefined> {
  const row = await db
    .selectFrom('users')
    .select(userColumns)
    .where('phone', '=', phone)
    .executeTakeFirst();
  return row === undefined ? undefined : toUser(row);
}

export async function findUserById(db: Database, id: string): Promise<User | undefined> {
  const row = await db
    .selectFrom('users')
    .select(userColumns)
    .where('id', '=', id)
    .executeTakeFirst();
  return row === undefined ? undefined : toUser(row);
}

/**
 * A random 7-digit ColdLink ID that does not start with 0, so it reads the same however it is
 * written down. It is drawn from the CSPRNG, so IDs reveal nothing about sign-up order.
 */
export function generateColdlinkId(): string {
  return randomInt(1_000_000, 10_000_000).toString();
}

/**
 * Creates a farmer with a fresh ColdLink ID, retrying if the ID is taken. If the number registered
 * meanwhile, from a concurrent sign-in, that user is returned instead.
 */
export async function createUser(
  trx: Database,
  phone: string,
): Promise<{ user: User; created: boolean }> {
  for (let attempt = 0; attempt < COLDLINK_ID_ATTEMPTS; attempt += 1) {
    // on conflict do nothing, not a caught error: an error would abort the whole transaction.
    const row = await trx
      .insertInto('users')
      .values({
        phone,
        coldlink_id: generateColdlinkId(),
        roles: ['farmer'],
        consented_at: sql<Date>`now()`,
        last_login_at: sql<Date>`now()`,
      })
      .onConflict((oc) => oc.doNothing())
      .returning(userColumns)
      .executeTakeFirst();
    if (row !== undefined) return { user: toUser(row), created: true };
    const existing = await findUserByPhone(trx, phone);
    if (existing !== undefined) return { user: existing, created: false };
  }
  throw new Error(`No free ColdLink ID after ${COLDLINK_ID_ATTEMPTS} attempts`);
}

/** Stamps the sign-in, and the consent if this sign-in gave it, and returns the updated user. */
export async function recordLogin(trx: Database, user: User, consented: boolean): Promise<User> {
  await trx
    .updateTable('users')
    .set({
      last_login_at: sql<Date>`now()`,
      ...(user.consented_at === null && consented ? { consented_at: sql<Date>`now()` } : {}),
    })
    .where('id', '=', user.id)
    .execute();
  return (await findUserById(trx, user.id)) ?? user;
}

export async function updateProfile(
  db: Database,
  userId: string,
  changes: UpdateProfileChanges,
): Promise<User> {
  const row = await db
    .updateTable('users')
    .set(changes)
    .where('id', '=', userId)
    .returning(userColumns)
    .executeTakeFirstOrThrow();
  return toUser(row);
}

export function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    coldlink_id: user.coldlink_id,
    phone_masked: maskPhone(user.phone),
    full_name: user.full_name,
    roles: user.roles,
    preferred_channel: user.preferred_channel,
    home_lga: user.home_lga,
    home_lat: user.home_lat,
    home_lng: user.home_lng,
    consented_at: user.consented_at?.toISOString() ?? null,
    created_at: user.created_at.toISOString(),
  };
}
