import { randomInt } from 'node:crypto';
import type { BookingStatus } from '@coldlink/shared';
import { sql } from 'kysely';
import { generateBookingCode } from '../bookings/code.js';
import type { Database } from '../db/client.js';

function digits(count: number): string {
  return Array.from({ length: count }, () => randomInt(10)).join('');
}

// +234 800 is the toll-free range, so no SMS could reach a real person; 9 keeps clear of the dev
// seed's owners (+2348000000001 upward).
function testPhone(): string {
  return `+2348009${digits(6)}`;
}

export interface BookingFixture {
  bookingId: string;
  farmerId: string;
  ownerId: string;
  providerId: string;
}

async function insertUser(db: Database, role: 'farmer' | 'provider'): Promise<string> {
  const { id } = await db
    .insertInto('users')
    .values({ phone: testPhone(), coldlink_id: `8${digits(6)}`, roles: [role] })
    .returning('id')
    .executeTakeFirstOrThrow();
  return id;
}

/**
 * Inserts a farmer, a provider and its owner, and a booking in `status` priced as the PRD 6.1
 * worked example: 2 sqm × 30 days × ₦2,258, 7.5% commission, 30% deposit.
 */
export async function insertBooking(db: Database, status: BookingStatus): Promise<BookingFixture> {
  const farmerId = await insertUser(db, 'farmer');
  const ownerId = await insertUser(db, 'provider');
  const { id: providerId } = await db
    .insertInto('providers')
    .values({
      owner_user_id: ownerId,
      display_name: 'Booking test cold room',
      facility_type: 'cold_room',
      phone: testPhone(),
      address_text: 'Test address',
      location: sql<string>`extensions.st_setsrid(extensions.st_makepoint(3.9, 7.4), 4326)::extensions.geography`,
      capacity_total: 50,
      capacity_unit: 'sqm',
      price_per_unit_per_day_kobo: 225_800,
      verification_status: 'approved',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const { id: cropId } = await db
    .selectFrom('crops')
    .select('id')
    .orderBy('name')
    .limit(1)
    .executeTakeFirstOrThrow();
  const { id: bookingId } = await db
    .insertInto('bookings')
    .values({
      code: generateBookingCode(),
      farmer_id: farmerId,
      provider_id: providerId,
      crop_id: cropId,
      quantity: 2,
      capacity_unit: 'sqm',
      start_date: '2026-12-01',
      duration_days: 30,
      end_date: '2026-12-31',
      status,
      unit_price_kobo: 225_800,
      storage_subtotal_kobo: 13_548_000,
      commission_rate: 0.075,
      commission_kobo: 1_016_100,
      service_fee_kobo: 0,
      deposit_percent: 0.3,
      deposit_kobo: 4_064_400,
      balance_due_kobo: 9_483_600,
      total_charged_online_kobo: 4_064_400,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { bookingId, farmerId, ownerId, providerId };
}

/**
 * Deletes a committed fixture. booking_events is append-only (decision 27), so its guard trigger is
 * disabled for this one transaction, which no other session sees; this needs the table's owner,
 * as the test database's migrations user is.
 */
export async function deleteBooking(db: Database, fixture: BookingFixture): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`alter table public.booking_events disable trigger booking_events_no_update_or_delete`.execute(
      trx,
    );
    await trx.deleteFrom('booking_events').where('booking_id', '=', fixture.bookingId).execute();
    await sql`alter table public.booking_events enable trigger booking_events_no_update_or_delete`.execute(
      trx,
    );
    await trx.deleteFrom('bookings').where('id', '=', fixture.bookingId).execute();
    await trx.deleteFrom('providers').where('id', '=', fixture.providerId).execute();
    await trx.deleteFrom('users').where('id', 'in', [fixture.farmerId, fixture.ownerId]).execute();
  });
}

export interface CommittedRows {
  providerIds: string[];
  userIds: string[];
}

/**
 * Deletes committed providers and users with every booking and booking event made for those
 * providers, disabling the append-only trigger for this one transaction as deleteBooking does.
 */
export async function deleteCommittedRows(db: Database, rows: CommittedRows): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const bookingIds = trx
      .selectFrom('bookings')
      .select('id')
      .where('provider_id', 'in', rows.providerIds);
    await sql`alter table public.booking_events disable trigger booking_events_no_update_or_delete`.execute(
      trx,
    );
    await trx.deleteFrom('booking_events').where('booking_id', 'in', bookingIds).execute();
    await sql`alter table public.booking_events enable trigger booking_events_no_update_or_delete`.execute(
      trx,
    );
    await trx.deleteFrom('bookings').where('provider_id', 'in', rows.providerIds).execute();
    await trx.deleteFrom('providers').where('id', 'in', rows.providerIds).execute();
    await trx.deleteFrom('users').where('id', 'in', rows.userIds).execute();
  });
}
