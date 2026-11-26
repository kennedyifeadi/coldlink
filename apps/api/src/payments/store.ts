import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import type { JsonObject } from '../db/schema.js';

/** A booking charge's reference (`CLP-`) or a refund's (`CLR-`), with 80 random bits. */
export function generatePaymentReference(kind: 'charge' | 'refund'): string {
  return `${kind === 'charge' ? 'CLP' : 'CLR'}-${randomBytes(10).toString('hex')}`;
}

/** Adds `fields` to the row's `paystack_payload`, keeping what is there. */
export function mergePayload(fields: JsonObject) {
  return sql<JsonObject>`coalesce(paystack_payload, '{}'::jsonb) || ${JSON.stringify(fields)}::jsonb`;
}

/**
 * The farmer's charge with this reference, for a booking or a delivery of theirs, or undefined if
 * there is none or it is not theirs.
 */
export function findFarmerCharge(db: Database, farmerId: string, reference: string) {
  return db
    .selectFrom('payments')
    .innerJoin('bookings', 'bookings.id', 'payments.booking_id')
    .select(['payments.id', 'payments.booking_id', 'payments.status'])
    .where('payments.provider_ref', '=', reference)
    .where('payments.purpose', 'in', ['booking_deposit', 'delivery_fee'])
    .where('bookings.farmer_id', '=', farmerId)
    .executeTakeFirst();
}

/** The charge's status and its booking's, as a verify answer reports them. */
export function chargeAndBookingStatus(db: Database, reference: string) {
  return db
    .selectFrom('payments')
    .innerJoin('bookings', 'bookings.id', 'payments.booking_id')
    .select([
      'payments.status as payment_status',
      'payments.delivery_request_id',
      'bookings.id',
      'bookings.status',
    ])
    .where('payments.provider_ref', '=', reference)
    .executeTakeFirstOrThrow();
}
