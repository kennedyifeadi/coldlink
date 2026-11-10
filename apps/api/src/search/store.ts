import type { CapacityUnit, VerificationStatus } from '@coldlink/shared';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { selectProviders, toProviderRecords, type ProviderRecord } from '../providers/store.js';

export interface SearchCriteria {
  lat: number;
  lng: number;
  radiusKm: number;
  categoryId: string;
  quantity: number;
  capacityUnit: CapacityUnit;
  startDate: string;
  endDate: string;
  /** Who may appear: approved only while `require_provider_approval` is on (decision 69). */
  verificationStatuses: VerificationStatus[];
}

export interface SearchCandidate {
  provider: ProviderRecord;
  distance_km: number;
  available_quantity: number;
}

/** The crop's category, or undefined for an unknown crop. */
export async function findCropCategoryId(
  db: Database,
  cropId: string,
): Promise<string | undefined> {
  const row = await db
    .selectFrom('crops')
    .select('category_id')
    .where('id', '=', cropId)
    .executeTakeFirst();
  return row?.category_id;
}

// One query for every hard filter in PRD 6.8. The cheap filters run first, in a materialized CTE,
// so provider_available_quantity (PL/pgSQL, which the planner cannot inline) runs once per
// remaining candidate rather than for every provider in the radius; the second materialized CTE
// keeps Postgres from evaluating it twice, once for the filter and once for the column.
export async function searchProviders(
  db: Database,
  criteria: SearchCriteria,
): Promise<SearchCandidate[]> {
  const rows = await db
    .with(
      (cte) => cte('candidates').materialized(),
      (qb) =>
        selectProviders(qb)
          .innerJoin(
            sql<{
              provider_id: string;
              distance_km: number;
            }>`public.providers_within_radius(${criteria.lat}, ${criteria.lng}, ${criteria.radiusKm})`.as(
              'nearby',
            ),
            (join) => join.onRef('nearby.provider_id', '=', 'providers.id'),
          )
          .select('nearby.distance_km')
          .where('providers.is_accepting_bookings', '=', true)
          .where('providers.capacity_unit', '=', criteria.capacityUnit)
          .where('providers.verification_status', 'in', criteria.verificationStatuses)
          .where((eb) =>
            eb.exists(
              eb
                .selectFrom('provider_crop_support')
                .select(sql`1`.as('supported'))
                .whereRef('provider_crop_support.provider_id', '=', 'providers.id')
                .where('provider_crop_support.category_id', '=', criteria.categoryId),
            ),
          ),
    )
    .with(
      (cte) => cte('available').materialized(),
      (qb) =>
        qb
          .selectFrom('candidates')
          .selectAll()
          .select(
            sql<number>`public.provider_available_quantity(candidates.id, ${criteria.startDate}::date, ${criteria.endDate}::date)`.as(
              'available_quantity',
            ),
          ),
    )
    .selectFrom('available')
    .selectAll()
    .where('available_quantity', '>=', criteria.quantity)
    .execute();

  const records = await toProviderRecords(
    db,
    rows.map(({ distance_km: _distance, available_quantity: _available, ...provider }) => provider),
  );
  return rows.map((row, index) => ({
    provider: records[index] as ProviderRecord,
    distance_km: row.distance_km,
    available_quantity: row.available_quantity,
  }));
}

export interface SearchLogEntry {
  userId: string | undefined;
  lat: number;
  lng: number;
  cropId: string;
  quantity: number;
  days: number;
  resultCount: number;
  expandedRadius: boolean;
}

export async function logSearch(db: Database, entry: SearchLogEntry): Promise<void> {
  await db
    .insertInto('search_logs')
    .values({
      user_id: entry.userId ?? null,
      lat: entry.lat,
      lng: entry.lng,
      crop_id: entry.cropId,
      quantity: entry.quantity,
      duration_days: entry.days,
      result_count: entry.resultCount,
      expanded_radius: entry.expandedRadius,
      channel: 'web',
    })
    .execute();
}
