import { sql, type InferResult, type QueryCreator } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';

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
