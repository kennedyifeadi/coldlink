import {
  bookingStatusSchema,
  PROVIDER_DASHBOARD_LIST_LIMIT,
  providerBookingGroupOf,
  providerBookingGroupStatuses,
  type ProviderBookingGroup,
  type ProviderBookingsQueryInput,
  type ProviderEarnings,
} from '@coldlink/shared';
import { sql, type InferResult, type QueryCreator, type RawBuilder } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { listBookingStatusHistory, type BookingStatusChangeRow } from './store.js';

/**
 * Locks the booking until the transaction ends and reads what a provider's action checks, with
 * whether `userId` owns its facility; undefined if there is no such booking. Only the booking row
 * is locked, so this never waits on the provider row that booking creation and payment lock.
 */
export function lockBookingForProvider(db: Database, bookingId: string, userId: string) {
  return db
    .selectFrom('bookings')
    .select((eb) => [
      'bookings.status',
      'bookings.start_date',
      // On the database's clock, which set the deadline (decision 93).
      sql<boolean>`coalesce(bookings.provider_response_due_at <= now(), false)`.as(
        'response_overdue',
      ),
      eb
        .exists(
          eb
            .selectFrom('providers')
            .select('providers.id')
            .whereRef('providers.id', '=', 'bookings.provider_id')
            .where('providers.owner_user_id', '=', userId),
        )
        .as('owned'),
    ])
    .where('bookings.id', '=', bookingId)
    .forUpdate()
    .executeTakeFirst();
}

/** The owner of the booking's facility, who acts when the SMS link is used. */
export async function facilityOwnerId(db: Database, bookingId: string): Promise<string> {
  const { owner_user_id } = await db
    .selectFrom('bookings')
    .innerJoin('providers', 'providers.id', 'bookings.provider_id')
    .select('providers.owner_user_id')
    .where('bookings.id', '=', bookingId)
    .executeTakeFirstOrThrow();
  return owner_user_id;
}

// No farmer column is read, so no farmer detail can reach a provider (PRD 10).
function selectProviderBookings(db: QueryCreator<DB>) {
  return db
    .selectFrom('bookings')
    .innerJoin('providers', 'providers.id', 'bookings.provider_id')
    .innerJoin('crops', 'crops.id', 'bookings.crop_id')
    .select([
      'bookings.id',
      'bookings.code',
      'bookings.status',
      'bookings.provider_id',
      'bookings.crop_id',
      'bookings.quantity',
      'bookings.capacity_unit',
      'bookings.start_date',
      'bookings.duration_days',
      'bookings.end_date',
      'bookings.balance_due_kobo',
      'bookings.deposit_kobo',
      'bookings.commission_kobo',
      'bookings.provider_response_due_at',
      'bookings.checked_in_at',
      'bookings.collected_at',
      'providers.display_name as provider_display_name',
      'crops.name as crop_name',
    ]);
}

export type ProviderBookingRow = InferResult<ReturnType<typeof selectProviderBookings>>[number];

/** For a booking the caller has just read or written; a missing one is a bug, not a 404. */
export function requireProviderBooking(
  db: Database,
  bookingId: string,
): Promise<ProviderBookingRow> {
  return selectProviderBookings(db).where('bookings.id', '=', bookingId).executeTakeFirstOrThrow();
}

// A facility hears of a booking once it is paid (decision 93); an unpaid hold, whether still
// running or expired, was never put to it, so its reads leave those out.
const askedOfProvider = sql<boolean>`exists (
  select 1 from public.booking_events as asked
  where asked.booking_id = bookings.id and asked.to_status = 'pending_provider'
)`;

/** The facility's bookings that it has been asked about. */
function selectFacilityBookings(db: QueryCreator<DB>, providerId: string) {
  return selectProviderBookings(db)
    .where('bookings.provider_id', '=', providerId)
    .where(askedOfProvider);
}

interface GroupOrder {
  /** The sort key of the booking row under `alias`, never null so a cursor can compare it. */
  key: (alias: string) => RawBuilder<unknown>;
  direction: 'asc' | 'desc';
}

const columnOf = (name: string) => (alias: string) => sql`${sql.ref(`${alias}.${name}`)}`;

// Requests by the soonest deadline, upcoming by arrival, in storage by the soonest collection,
// and the past newest first. The id breaks ties, so the order and the pages are stable.
const groupOrders: Record<ProviderBookingGroup, GroupOrder> = {
  requests: {
    // Payment sets the deadline (decision 93), so a request without one is a bug; it sorts last.
    key: (alias) =>
      sql`coalesce(${sql.ref(`${alias}.provider_response_due_at`)}, 'infinity'::timestamptz)`,
    direction: 'asc',
  },
  upcoming: { key: columnOf('start_date'), direction: 'asc' },
  in_storage: { key: columnOf('end_date'), direction: 'asc' },
  past: { key: columnOf('start_date'), direction: 'desc' },
};

function selectGroup(db: Database, providerId: string, group: ProviderBookingGroup) {
  const { key, direction } = groupOrders[group];
  return selectFacilityBookings(db, providerId)
    .where('bookings.status', 'in', [...providerBookingGroupStatuses[group]])
    .orderBy(key('bookings'), direction)
    .orderBy('bookings.id', direction);
}

// Keyset paging: the cursor is the last booking of the page before, and the next page starts
// after its sort key, read from that row, so no timestamp is rounded on a trip through the client.
// A cursor that is not one of the facility's bookings gives an empty page.
function afterCursor(providerId: string, group: ProviderBookingGroup, cursor: string) {
  const { key, direction } = groupOrders[group];
  const after = sql.raw(direction === 'asc' ? '>' : '<');
  return sql<boolean>`(${key('bookings')}, bookings.id) ${after} (
    select ${key('cursor_row')}, cursor_row.id from public.bookings as cursor_row
    where cursor_row.id = ${cursor} and cursor_row.provider_id = ${providerId}
  )`;
}

export interface ProviderBookingsPage {
  rows: ProviderBookingRow[];
  nextCursor: string | null;
}

/** One page of a group of the facility's bookings, in the group's order. */
export async function listProviderBookings(
  db: Database,
  providerId: string,
  { group, limit, cursor }: ProviderBookingsQueryInput,
): Promise<ProviderBookingsPage> {
  let query = selectGroup(db, providerId, group).limit(limit + 1);
  if (cursor !== undefined) query = query.where(afterCursor(providerId, group, cursor));
  const rows = await query.execute();
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { rows: page, nextCursor: rows.length > limit && last ? last.id : null };
}

/** The first few bookings of a group, for the dashboard. */
export function listDashboardBookings(
  db: Database,
  providerId: string,
  group: ProviderBookingGroup,
): Promise<ProviderBookingRow[]> {
  return selectGroup(db, providerId, group).limit(PROVIDER_DASHBOARD_LIST_LIMIT).execute();
}

export type ProviderBookingCounts = Record<ProviderBookingGroup, number>;

/** How many of the facility's bookings are in each group. */
export async function countProviderBookings(
  db: Database,
  providerId: string,
): Promise<ProviderBookingCounts> {
  const rows = await selectFacilityBookings(db, providerId)
    .clearSelect()
    .select((eb) => ['bookings.status', eb.fn.countAll<number>().as('count')])
    .groupBy('bookings.status')
    .execute();
  const counts: ProviderBookingCounts = { requests: 0, upcoming: 0, in_storage: 0, past: 0 };
  for (const { status, count } of rows) {
    const group = providerBookingGroupOf(bookingStatusSchema.parse(status));
    if (group !== undefined) counts[group] += count;
  }
  return counts;
}

export interface ProviderBookingDetailRows {
  booking: ProviderBookingRow;
  history: BookingStatusChangeRow[];
}

/**
 * One of the facility's bookings with its status history, or undefined when the facility has no
 * such booking or was never asked about it.
 */
export async function findProviderBookingDetail(
  db: Database,
  providerId: string,
  bookingId: string,
): Promise<ProviderBookingDetailRows | undefined> {
  const booking = await selectFacilityBookings(db, providerId)
    .where('bookings.id', '=', bookingId)
    .executeTakeFirst();
  if (booking === undefined) return undefined;
  return { booking, history: await listBookingStatusHistory(db, bookingId) };
}

/** The sums of the facility's payouts still owed and already paid (PRD 5.8, 6.4). */
export function providerEarnings(db: Database, providerId: string): Promise<ProviderEarnings> {
  // Cast to bigint, not left as sum()'s numeric, so the pool's safe-integer check applies to kobo.
  return db
    .selectFrom('payouts')
    .select([
      sql<number>`coalesce(sum(amount_kobo) filter (where status = 'owed'), 0)::bigint`.as(
        'owed_kobo',
      ),
      sql<number>`coalesce(sum(amount_kobo) filter (where status = 'paid'), 0)::bigint`.as(
        'paid_kobo',
      ),
    ])
    .where('provider_id', '=', providerId)
    .executeTakeFirstOrThrow();
}
