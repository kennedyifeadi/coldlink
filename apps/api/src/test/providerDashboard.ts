import { addDays, calculatePricing, type BookingStatus } from '@coldlink/shared';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { insertBookingRow, type BookingFixture } from './bookings.js';

// insertBooking's facility: ₦2,258 per sqm per day, 7.5% commission, 30% deposit, no service fee.
const UNIT_PRICE_KOBO = 225_800;
const RATES = { commission_rate: 0.075, deposit_percent: 0.3 } as const;

export interface ExtraBooking {
  status: BookingStatus;
  startDate: string;
  days?: number;
  quantity?: number;
  /** Minutes from the database's now to the provider's deadline; set only when given. */
  responseDueMinutes?: number;
  /** Minutes from the database's now to the end of an unpaid hold. */
  holdMinutes?: number;
  /** Whether the booking was paid and put to the provider; true unless it is an unpaid hold. */
  asked?: boolean;
}

/**
 * Adds a booking to the fixture's facility for the fixture's farmer, priced as the facility prices,
 * with the events that put it in its status: created, then paid (pending_provider) when asked.
 */
export async function addBooking(
  db: Database,
  fixture: BookingFixture,
  booking: ExtraBooking,
): Promise<string> {
  const { status, startDate, days = 10, quantity = 1 } = booking;
  const asked = booking.asked ?? status !== 'payment_pending';
  const pricing = calculatePricing({
    quantity,
    duration_days: days,
    unit_price_kobo: UNIT_PRICE_KOBO,
    service_fee_kobo: 0,
    ...RATES,
  });
  const { crop_id } = await db
    .selectFrom('bookings')
    .select('crop_id')
    .where('id', '=', fixture.bookingId)
    .executeTakeFirstOrThrow();
  const bookingId = await insertBookingRow(db, {
    farmer_id: fixture.farmerId,
    provider_id: fixture.providerId,
    crop_id,
    quantity,
    capacity_unit: 'sqm',
    start_date: startDate,
    duration_days: days,
    end_date: addDays(startDate, days),
    status,
    unit_price_kobo: UNIT_PRICE_KOBO,
    storage_subtotal_kobo: pricing.storage_subtotal_kobo,
    commission_rate: RATES.commission_rate,
    commission_kobo: pricing.commission_kobo,
    service_fee_kobo: 0,
    deposit_percent: RATES.deposit_percent,
    deposit_kobo: pricing.deposit_kobo,
    balance_due_kobo: pricing.balance_due_kobo,
    total_charged_online_kobo: pricing.total_charged_online_kobo,
    cancelled_by: status === 'cancelled' ? 'farmer' : null,
  });
  // On the database's clock, which the deadline and the hold are compared with.
  const fromNow = (minutes: number | undefined) =>
    minutes === undefined ? null : sql<Date>`now() + make_interval(mins => ${minutes}::int)`;
  await db
    .updateTable('bookings')
    .set({
      provider_response_due_at: fromNow(booking.responseDueMinutes),
      payment_expires_at: fromNow(booking.holdMinutes),
    })
    .where('id', '=', bookingId)
    .execute();
  const events = [
    {
      from_status: null,
      to_status: 'payment_pending',
      actor_type: 'farmer',
      actor_id: fixture.farmerId,
    },
    ...(asked
      ? [
          {
            from_status: 'payment_pending',
            to_status: 'pending_provider',
            actor_type: 'system',
            actor_id: null,
          },
        ]
      : []),
  ];
  await db
    .insertInto('booking_events')
    .values(events.map((event) => ({ ...event, booking_id: bookingId })))
    .execute();
  return bookingId;
}

/** Records a payout for the booking, owed, or paid with what an admin's record needs. */
export async function addPayout(
  db: Database,
  {
    bookingId,
    providerId,
    amountKobo,
    paidBy,
  }: {
    bookingId: string;
    providerId: string;
    amountKobo: number;
    /** The admin who marked it paid; owed when left out. */
    paidBy?: string;
  },
): Promise<void> {
  await db
    .insertInto('payouts')
    .values({
      booking_id: bookingId,
      provider_id: providerId,
      amount_kobo: amountKobo,
      ...(paidBy === undefined
        ? {}
        : {
            status: 'paid',
            paid_at: sql<Date>`now()`,
            reference: 'TRF-TEST',
            recorded_by: paidBy,
          }),
    })
    .execute();
}
