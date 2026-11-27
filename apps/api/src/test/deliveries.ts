import { randomInt } from 'node:crypto';
import { startOfDayInLagos, type VehicleType } from '@coldlink/shared';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { deleteBooking, type BookingFixture } from './bookings.js';
import { insertCharge } from './payments.js';
import { WORKED_EXAMPLE } from './providerActions.js';

// The delivery partner fixtures of #43. No API creates partners yet (#46), so tests insert them.

export const DELIVERY_FEE = 245_000;
export const PARTNER_PAYOUT = 196_000;
export const PLATFORM_MARGIN = 49_000;
export const HANDOVER_CODE = '0427';
export const CONTACT_PHONE = '+2348009123456';
export const FARMER_ADDRESS = 'Akinyele farm road, by the blue gate';
// Far enough ahead that the end of the day, not the 12-hour floor, sets every link's expiry.
export const SCHEDULED_DAY = '2027-06-15';

// +234 800 is the toll-free range, so no SMS could reach a real person.
function testPhone(): string {
  return `+2348007${randomInt(100_000, 1_000_000)}`;
}

export interface PartnerFixture {
  partnerId: string;
  userId: string;
  phone: string;
}

export interface PartnerOptions {
  vehicleTypes?: VehicleType[];
  coverageLgas?: string[];
  isActive?: boolean;
}

export async function insertPartner(
  db: Database,
  { vehicleTypes = ['bike', 'van'], coverageLgas = [], isActive = true }: PartnerOptions = {},
): Promise<PartnerFixture> {
  const phone = testPhone();
  const { id: userId } = await db
    .insertInto('users')
    .values({
      phone,
      coldlink_id: `7${randomInt(100_000, 1_000_000)}`,
      roles: ['delivery_partner'],
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const { id: partnerId } = await db
    .insertInto('delivery_partners')
    .values({
      user_id: userId,
      company_name: 'Swift Riders (test)',
      phone,
      vehicle_types: vehicleTypes,
      coverage_lgas: coverageLgas,
      is_active: isActive,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { partnerId, userId, phone };
}

function point(lat: number, lng: number) {
  return sql<string>`extensions.st_setsrid(extensions.st_makepoint(${lng}, ${lat}), 4326)::extensions.geography`;
}

/**
 * Inserts an inbound delivery for the fixture's booking, `requested` and paid with the booking,
 * and the booking's charge it was paid with, so a cancellation has something to refund against.
 */
export async function insertPaidDelivery(
  db: Database,
  booking: BookingFixture,
  { paid = true }: { paid?: boolean } = {},
): Promise<string> {
  await insertCharge(db, {
    bookingId: booking.bookingId,
    status: 'success',
    amountKobo: WORKED_EXAMPLE.depositKobo,
  });
  const { id } = await db
    .insertInto('delivery_requests')
    .values({
      context_type: 'booking_inbound',
      context_id: booking.bookingId,
      requested_by: booking.farmerId,
      pickup_text: FARMER_ADDRESS,
      pickup_location: point(7.5, 3.9),
      dropoff_text: 'Booking test cold room, Test address',
      dropoff_location: point(7.4, 3.9),
      contact_name: 'Bola',
      contact_phone: CONTACT_PHONE,
      load_description: 'Tomatoes in crates',
      load_quantity: 5,
      load_unit: 'crates',
      distance_km: 14.5,
      vehicle_type: 'bike',
      fee_kobo: DELIVERY_FEE,
      partner_payout_kobo: PARTNER_PAYOUT,
      platform_margin_kobo: PLATFORM_MARGIN,
      status: 'requested',
      handover_code: HANDOVER_CODE,
      scheduled_for: startOfDayInLagos(SCHEDULED_DAY),
      paid_at: paid ? sql<Date>`now()` : null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return id;
}

export function deliveryRow(db: Database, id: string) {
  return db
    .selectFrom('delivery_requests')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}

export function deliveryTokens(db: Database, deliveryId: string) {
  return db
    .selectFrom('action_tokens')
    .selectAll()
    .where('subject_id', '=', deliveryId)
    .orderBy('created_at')
    .execute();
}

/** The token in the last link to the partner's page found in a text. */
export function tokenIn(text: string | undefined): string {
  const match = /\/d\/([A-Za-z0-9_-]{43})$/.exec(text ?? '');
  if (match?.[1] === undefined) throw new Error('No delivery link in the message');
  return match[1];
}

/**
 * Deletes committed delivery fixtures with their booking, as deleteBooking does for bookings, and
 * the other users given, with their partner rows and messages.
 */
export async function deleteDeliveryFixtures(
  db: Database,
  booking: BookingFixture,
  userIds: string[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const deliveryIds = trx
      .selectFrom('delivery_requests')
      .select('id')
      .where('context_id', '=', booking.bookingId);
    await trx.deleteFrom('action_tokens').where('subject_id', 'in', deliveryIds).execute();
    await trx.deleteFrom('payments').where('booking_id', '=', booking.bookingId).execute();
    await trx.deleteFrom('delivery_requests').where('context_id', '=', booking.bookingId).execute();
    if (userIds.length > 0) {
      await trx.deleteFrom('notifications').where('user_id', 'in', userIds).execute();
      await trx.deleteFrom('delivery_partners').where('user_id', 'in', userIds).execute();
      await trx.deleteFrom('users').where('id', 'in', userIds).execute();
    }
  });
  await deleteBooking(db, booking);
}
