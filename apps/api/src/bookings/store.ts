import type { AppConfig, CapacityUnit, PricingBreakdown } from '@coldlink/shared';
import { sql, type InferResult, type QueryCreator } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import type { StoragePeriod } from '../storagePeriod.js';
import { generateBookingCode } from './code.js';

// 32^5 codes, so a code is taken twice in a row only once the table holds millions of bookings.
const BOOKING_CODE_ATTEMPTS = 5;

export interface NewBooking {
  farmerId: string;
  providerId: string;
  cropId: string;
  quantity: number;
  capacityUnit: CapacityUnit;
  period: StoragePeriod;
  days: number;
  unitPriceKobo: number;
  pricing: PricingBreakdown;
  /** The config the booking was priced with; its rates and hold are copied onto the booking. */
  config: Pick<AppConfig, 'commission_rate' | 'deposit_percent' | 'payment_hold_minutes'>;
}

/**
 * Inserts a `payment_pending` booking holding its capacity for `payment_hold_minutes`, with a
 * fresh code, retrying if the code is taken. Every price, rate and fee is a snapshot (PRD 5.5).
 */
export async function insertBooking(
  trx: Database,
  booking: NewBooking,
  generateCode: () => string = generateBookingCode,
): Promise<string> {
  const { pricing, config } = booking;
  for (let attempt = 0; attempt < BOOKING_CODE_ATTEMPTS; attempt += 1) {
    // on conflict do nothing, not a caught error: an error would abort the whole transaction.
    const row = await trx
      .insertInto('bookings')
      .values({
        code: generateCode(),
        farmer_id: booking.farmerId,
        provider_id: booking.providerId,
        crop_id: booking.cropId,
        quantity: booking.quantity,
        capacity_unit: booking.capacityUnit,
        start_date: booking.period.startDate,
        duration_days: booking.days,
        end_date: booking.period.endDate,
        status: 'payment_pending',
        unit_price_kobo: booking.unitPriceKobo,
        storage_subtotal_kobo: pricing.storage_subtotal_kobo,
        commission_rate: config.commission_rate,
        commission_kobo: pricing.commission_kobo,
        service_fee_kobo: pricing.service_fee_kobo,
        deposit_percent: config.deposit_percent,
        deposit_kobo: pricing.deposit_kobo,
        balance_due_kobo: pricing.balance_due_kobo,
        delivery_fee_kobo: pricing.delivery_fee_kobo,
        total_charged_online_kobo: pricing.total_charged_online_kobo,
        payment_expires_at: sql<Date>`now() + make_interval(mins => ${config.payment_hold_minutes}::int)`,
      })
      .onConflict((oc) => oc.column('code').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (row !== undefined) return row.id;
  }
  throw new Error(`No free booking code after ${BOOKING_CODE_ATTEMPTS} attempts`);
}

/**
 * The event that creates a booking. Creation is not a transition, so it is written here rather
 * than through transitionBooking (decision 84).
 */
export async function recordBookingCreated(
  trx: Database,
  bookingId: string,
  farmerId: string,
): Promise<void> {
  await trx
    .insertInto('booking_events')
    .values({
      booking_id: bookingId,
      from_status: null,
      to_status: 'payment_pending',
      actor_type: 'farmer',
      actor_id: farmerId,
    })
    .execute();
}

const farmerBookingColumns = [
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
  'bookings.unit_price_kobo',
  'bookings.storage_subtotal_kobo',
  'bookings.service_fee_kobo',
  'bookings.deposit_kobo',
  'bookings.balance_due_kobo',
  'bookings.delivery_fee_kobo',
  'bookings.total_charged_online_kobo',
  'bookings.payment_expires_at',
  'bookings.provider_response_due_at',
  'bookings.checked_in_at',
  'bookings.collected_at',
  'bookings.cancelled_by',
  'bookings.cancel_reason',
  'bookings.created_at',
] as const;

// No commission, rate or payout column is read, so none can reach a farmer (decision 48).
function selectFarmerBookings(db: QueryCreator<DB>, farmerId: string) {
  return db
    .selectFrom('bookings')
    .innerJoin('providers', 'providers.id', 'bookings.provider_id')
    .innerJoin('crops', 'crops.id', 'bookings.crop_id')
    .select(farmerBookingColumns)
    .select([
      'providers.display_name as provider_display_name',
      'providers.lga as provider_lga',
      'providers.address_text as provider_address_text',
      'providers.landmark as provider_landmark',
      'crops.name as crop_name',
    ])
    .where('bookings.farmer_id', '=', farmerId);
}

export type FarmerBookingRow = InferResult<ReturnType<typeof selectFarmerBookings>>[number];

/** The farmer's booking, or undefined if there is none with that id or it is someone else's. */
export function findFarmerBooking(
  db: Database,
  farmerId: string,
  bookingId: string,
): Promise<FarmerBookingRow | undefined> {
  return selectFarmerBookings(db, farmerId).where('bookings.id', '=', bookingId).executeTakeFirst();
}

/** For a booking the caller has just read or written; a missing one is a bug, not a 404. */
export async function requireFarmerBooking(
  db: Database,
  farmerId: string,
  bookingId: string,
): Promise<FarmerBookingRow> {
  const booking = await findFarmerBooking(db, farmerId, bookingId);
  if (booking === undefined) throw new Error(`Booking ${bookingId} not found`);
  return booking;
}

/** Every booking the farmer has made, newest first. */
export function listFarmerBookings(db: Database, farmerId: string): Promise<FarmerBookingRow[]> {
  return selectFarmerBookings(db, farmerId)
    .orderBy('bookings.created_at', 'desc')
    .orderBy('bookings.id', 'desc')
    .execute();
}

/**
 * Locks the farmer's booking until the transaction ends and reads what the refund depends on, or
 * undefined if there is none with that id or it is someone else's.
 */
export function lockFarmerBooking(db: Database, farmerId: string, bookingId: string) {
  return db
    .selectFrom('bookings')
    .select(['status', 'start_date', 'deposit_kobo', 'total_charged_online_kobo'])
    .where('id', '=', bookingId)
    .where('farmer_id', '=', farmerId)
    .forUpdate()
    .executeTakeFirst();
}
