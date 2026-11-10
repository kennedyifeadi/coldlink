import type {
  CreateProviderInput,
  CropCategory,
  UpdateProviderInput,
  VerificationStatus,
} from '@coldlink/shared';
import {
  backupPowerSchema,
  capacityUnitSchema,
  facilityTypeSchema,
  MAX_PROVIDER_PHOTOS,
  verificationStatusSchema,
} from '@coldlink/shared';
import { sql, type QueryCreator, type Selectable } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB, Providers } from '../db/schema.js';

export type ProviderRow = Omit<Selectable<Providers>, 'location'> & { lat: number; lng: number };

export interface ProviderRecord extends Omit<
  ProviderRow,
  'facility_type' | 'capacity_unit' | 'has_backup_power' | 'verification_status'
> {
  facility_type: CreateProviderInput['facility_type'];
  capacity_unit: CreateProviderInput['capacity_unit'];
  has_backup_power: NonNullable<CreateProviderInput['has_backup_power']>;
  verification_status: VerificationStatus;
  categories: CropCategory[];
}

const providerColumns = [
  'id',
  'owner_user_id',
  'business_name',
  'display_name',
  'facility_type',
  'description',
  'phone',
  'whatsapp',
  'address_text',
  'landmark',
  'lga',
  'capacity_total',
  'capacity_unit',
  'price_per_unit_per_day_kobo',
  'min_storage_days',
  'temp_min_c',
  'temp_max_c',
  'has_backup_power',
  'verification_status',
  'verified_at',
  'is_accepting_bookings',
  'avg_rating',
  'rating_count',
  'cancellation_count',
  'photos',
  'created_at',
  'updated_at',
] as const;

function point(lat: number, lng: number) {
  return sql<string>`extensions.st_setsrid(extensions.st_makepoint(${lng}, ${lat}), 4326)::extensions.geography`;
}

export function selectProviders(db: QueryCreator<DB>) {
  return db
    .selectFrom('providers')
    .select(providerColumns)
    .select([
      sql<number>`extensions.st_y(providers.location::extensions.geometry)`.as('lat'),
      sql<number>`extensions.st_x(providers.location::extensions.geometry)`.as('lng'),
    ]);
}

async function categoriesByProvider(
  db: Database,
  providerIds: string[],
): Promise<Map<string, CropCategory[]>> {
  const byProvider = new Map<string, CropCategory[]>();
  if (providerIds.length === 0) return byProvider;
  const rows = await db
    .selectFrom('provider_crop_support')
    .innerJoin('crop_categories', 'crop_categories.id', 'provider_crop_support.category_id')
    .select([
      'provider_crop_support.provider_id',
      'crop_categories.id',
      'crop_categories.slug',
      'crop_categories.name',
    ])
    .where('provider_crop_support.provider_id', 'in', providerIds)
    .orderBy('crop_categories.name')
    .execute();
  for (const { provider_id, ...category } of rows) {
    byProvider.set(provider_id, [...(byProvider.get(provider_id) ?? []), category]);
  }
  return byProvider;
}

// The database checks hold these to the same values; parsing narrows the text columns' types.
function toRecord(row: ProviderRow, categories: CropCategory[]): ProviderRecord {
  return {
    ...row,
    facility_type: facilityTypeSchema.parse(row.facility_type),
    capacity_unit: capacityUnitSchema.parse(row.capacity_unit),
    has_backup_power: backupPowerSchema.parse(row.has_backup_power),
    verification_status: verificationStatusSchema.parse(row.verification_status),
    categories,
  };
}

/** Records for rows read with selectProviders, in the same order, with one query for categories. */
export async function toProviderRecords(
  db: Database,
  rows: ProviderRow[],
): Promise<ProviderRecord[]> {
  const categories = await categoriesByProvider(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toRecord(row, categories.get(row.id) ?? []));
}

export async function findProvider(db: Database, id: string): Promise<ProviderRecord | undefined> {
  const row = await selectProviders(db).where('id', '=', id).executeTakeFirst();
  if (row === undefined) return undefined;
  const [record] = await toProviderRecords(db, [row]);
  return record;
}

/** For a provider the caller has just read or written; a missing one is a bug, not a 404. */
export async function requireProvider(db: Database, id: string): Promise<ProviderRecord> {
  const provider = await findProvider(db, id);
  if (provider === undefined) throw new Error(`Provider ${id} not found`);
  return provider;
}

export async function listOwnedProviders(
  db: Database,
  ownerUserId: string,
): Promise<ProviderRecord[]> {
  const rows = await selectProviders(db)
    .where('owner_user_id', '=', ownerUserId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return toProviderRecords(db, rows);
}

/** The ids in the list that are not crop categories. */
export async function unknownCategoryIds(db: Database, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const known = await db
    .selectFrom('crop_categories')
    .select('id')
    .where('id', 'in', ids)
    .execute();
  const knownIds = new Set(known.map((row) => row.id));
  return ids.filter((id) => !knownIds.has(id));
}

async function replaceCategories(trx: Database, providerId: string, categoryIds: string[]) {
  await trx.deleteFrom('provider_crop_support').where('provider_id', '=', providerId).execute();
  await trx
    .insertInto('provider_crop_support')
    .values(categoryIds.map((category_id) => ({ provider_id: providerId, category_id })))
    .execute();
}

export interface NewProvider {
  ownerUserId: string;
  phone: string;
  verificationStatus: Extract<VerificationStatus, 'pending' | 'approved'>;
  input: CreateProviderInput;
}

export async function insertProvider(
  trx: Database,
  { ownerUserId, phone, verificationStatus, input }: NewProvider,
): Promise<string> {
  const { lat, lng, category_ids, ...columns } = input;
  const { id } = await trx
    .insertInto('providers')
    .values({
      ...columns,
      owner_user_id: ownerUserId,
      phone,
      location: point(lat, lng),
      verification_status: verificationStatus,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await replaceCategories(trx, id, category_ids);
  return id;
}

export async function updateProvider(
  trx: Database,
  id: string,
  changes: UpdateProviderInput,
): Promise<void> {
  const { lat, lng, category_ids, ...columns } = changes;
  const location = lat === undefined || lng === undefined ? {} : { location: point(lat, lng) };
  if (Object.keys(columns).length > 0 || 'location' in location) {
    await trx
      .updateTable('providers')
      .set({ ...columns, ...location })
      .where('id', '=', id)
      .execute();
  }
  if (category_ids !== undefined) await replaceCategories(trx, id, category_ids);
}

/** Adds the provider role to a user who does not have it yet. */
export async function grantProviderRole(trx: Database, userId: string): Promise<void> {
  await trx
    .updateTable('users')
    .set({ roles: sql<string[]>`array_append(roles, 'provider')` })
    .where('id', '=', userId)
    .where(sql<boolean>`not ('provider' = any(roles))`)
    .execute();
}

/**
 * Adds a photo path unless the provider already has the maximum. The check and the append are one
 * statement, so two uploads racing for the last slot cannot both get it.
 */
export async function appendPhoto(
  db: Database,
  providerId: string,
  path: string,
): Promise<boolean> {
  const row = await db
    .updateTable('providers')
    .set({ photos: sql<string[]>`array_append(photos, ${path})` })
    .where('id', '=', providerId)
    .where(sql<boolean>`cardinality(photos) < ${MAX_PROVIDER_PHOTOS}`)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** Removes a photo path; false if the provider does not have it. */
export async function removePhoto(
  db: Database,
  providerId: string,
  path: string,
): Promise<boolean> {
  const row = await db
    .updateTable('providers')
    .set({ photos: sql<string[]>`array_remove(photos, ${path})` })
    .where('id', '=', providerId)
    .where(sql<boolean>`${path} = any(photos)`)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
