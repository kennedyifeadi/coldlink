import type { ProviderPayoutsQueryInput } from '@coldlink/shared';
import { sql, type InferResult } from 'kysely';
import type { Database } from '../db/client.js';

// Never recorded_by, and no farmer column: the provider sees what it is owed, not who paid it
// or whose produce it was (PRD 10).
function selectFacilityPayouts(db: Database, providerId: string) {
  return db
    .selectFrom('payouts')
    .innerJoin('bookings', 'bookings.id', 'payouts.booking_id')
    .innerJoin('crops', 'crops.id', 'bookings.crop_id')
    .select([
      'payouts.id',
      'payouts.amount_kobo',
      'payouts.status',
      'payouts.created_at',
      'payouts.paid_at',
      'payouts.reference',
      'bookings.id as booking_id',
      'bookings.code as booking_code',
      'bookings.crop_id',
      'crops.name as crop_name',
      'bookings.start_date',
      'bookings.duration_days',
      'bookings.end_date',
    ])
    .where('payouts.provider_id', '=', providerId);
}

export type ProviderPayoutRow = InferResult<ReturnType<typeof selectFacilityPayouts>>[number];

export interface ProviderPayoutsPage {
  rows: ProviderPayoutRow[];
  nextCursor: string | null;
}

// Keyset paging as for the booking lists (decision 119): the next page starts after the cursor
// payout's own key, read from its row, and a cursor that is not this facility's gives no rows.
function afterCursor(providerId: string, cursor: string) {
  return sql<boolean>`(payouts.created_at, payouts.id) < (
    select cursor_row.created_at, cursor_row.id from public.payouts as cursor_row
    where cursor_row.id = ${cursor} and cursor_row.provider_id = ${providerId}
  )`;
}

/** One page of the facility's payouts, newest first, with the given status or any. */
export async function listProviderPayouts(
  db: Database,
  providerId: string,
  { status, limit, cursor }: ProviderPayoutsQueryInput,
): Promise<ProviderPayoutsPage> {
  let query = selectFacilityPayouts(db, providerId)
    .orderBy('payouts.created_at', 'desc')
    .orderBy('payouts.id', 'desc')
    .limit(limit + 1);
  if (status !== undefined) query = query.where('payouts.status', '=', status);
  if (cursor !== undefined) query = query.where(afterCursor(providerId, cursor));
  const rows = await query.execute();
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { rows: page, nextCursor: rows.length > limit && last ? last.id : null };
}
