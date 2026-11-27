import { sql, type RawBuilder, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { contextTypeFor } from './store.js';

/** While the partner has the job in hand: the only statuses in which they see the farmer's end. */
const onTheJob = ['accepted', 'picked_up'];

/** The delivery's booking, for a delivery of a booking; undefined for an unknown id. */
export function findDeliveryBookingId(
  db: Database,
  deliveryId: string,
): Promise<{ bookingId: string } | undefined> {
  return db
    .selectFrom('delivery_requests')
    .select('context_id as bookingId')
    .where('id', '=', deliveryId)
    .where('context_type', 'in', Object.values(contextTypeFor))
    .executeTakeFirst();
}

/** Locks the booking a delivery move belongs to: the first lock every delivery path takes. */
export async function lockDeliveryBooking(trx: Transaction<DB>, bookingId: string): Promise<void> {
  await trx
    .selectFrom('bookings')
    .select('id')
    .where('id', '=', bookingId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

export function findPartner(db: Database, partnerId: string) {
  return db
    .selectFrom('delivery_partners')
    .select([
      'id',
      'user_id',
      'company_name',
      'phone',
      'vehicle_types',
      'coverage_lgas',
      'is_active',
    ])
    .where('id', '=', partnerId)
    .executeTakeFirst();
}

export type PartnerRow = NonNullable<Awaited<ReturnType<typeof findPartner>>>;

/** The database's clock, which every token expiry is checked against. */
export async function databaseNow(db: Database): Promise<Date> {
  const { rows } = await sql<{ now: Date }>`select now() as now`.execute(db);
  const now = rows[0]?.now;
  if (now === undefined) throw new Error('The database gave no time');
  return now;
}

const farmerEndText = sql<string>`case when delivery_requests.context_type = ${contextTypeFor.inbound}
  then delivery_requests.pickup_text else delivery_requests.dropoff_text end`;

function whileOnTheJob<T>(value: RawBuilder<T>) {
  return sql<T | null>`case when delivery_requests.status in (${sql.join(onTheJob)}) then ${value} end`;
}

/**
 * What the partner's page shows (decision 151). The farmer's end, the contact's name and phone and
 * the facility's address are selected through a `case` on the status, so they are never read
 * before the partner accepts or after the job ends. The fee, the margin and the handover code are
 * never selected.
 */
export function readPartnerJob(db: Database, deliveryId: string) {
  return db
    .selectFrom('delivery_requests')
    .innerJoin('bookings', 'bookings.id', 'delivery_requests.context_id')
    .innerJoin('providers', 'providers.id', 'bookings.provider_id')
    .select([
      'bookings.code as booking_code',
      'delivery_requests.context_type',
      'delivery_requests.status',
      'delivery_requests.scheduled_for',
      'providers.display_name as facility_name',
      'providers.lga as facility_lga',
      whileOnTheJob(sql<string>`providers.address_text`).as('facility_address'),
      whileOnTheJob(farmerEndText).as('farmer_address'),
      whileOnTheJob(sql<string | null>`delivery_requests.contact_name`).as('contact_name'),
      whileOnTheJob(sql<string>`delivery_requests.contact_phone`).as('contact_phone'),
      'delivery_requests.load_description',
      'delivery_requests.load_quantity',
      'delivery_requests.load_unit',
      'delivery_requests.vehicle_type',
      'delivery_requests.distance_km',
      'delivery_requests.partner_payout_kobo',
      'delivery_requests.handover_failed_attempts',
    ])
    .where('delivery_requests.id', '=', deliveryId)
    .executeTakeFirstOrThrow();
}

export type PartnerJobRow = Awaited<ReturnType<typeof readPartnerJob>>;

/** The admin's view of a delivery; never the handover code. */
export function readAdminDelivery(db: Database, deliveryId: string) {
  return db
    .selectFrom('delivery_requests')
    .innerJoin('bookings', 'bookings.id', 'delivery_requests.context_id')
    .innerJoin('providers', 'providers.id', 'bookings.provider_id')
    .leftJoin('delivery_partners', 'delivery_partners.id', 'delivery_requests.partner_id')
    .select([
      'delivery_requests.id',
      'delivery_requests.context_type',
      'delivery_requests.context_id',
      'bookings.code as booking_code',
      'delivery_requests.status',
      'delivery_requests.paid_at',
      'delivery_requests.pickup_text',
      'delivery_requests.dropoff_text',
      'delivery_requests.contact_name',
      'delivery_requests.contact_phone',
      'delivery_requests.load_description',
      'delivery_requests.load_quantity',
      'delivery_requests.load_unit',
      'delivery_requests.vehicle_type',
      'delivery_requests.distance_km',
      'delivery_requests.fee_kobo',
      'delivery_requests.partner_payout_kobo',
      'delivery_requests.platform_margin_kobo',
      'delivery_requests.scheduled_for',
      'delivery_requests.assigned_at',
      'delivery_requests.picked_up_at',
      'delivery_requests.delivered_at',
      'delivery_requests.handover_failed_attempts',
      'delivery_partners.id as partner_id',
      'delivery_partners.company_name as partner_company_name',
      'delivery_partners.coverage_lgas as partner_coverage_lgas',
      'providers.lga as facility_lga',
    ])
    .where('delivery_requests.id', '=', deliveryId)
    .executeTakeFirstOrThrow();
}

export type AdminDeliveryRow = Awaited<ReturnType<typeof readAdminDelivery>>;

/** What the delivery SMS say, and to whom. The handover code is read only when it is sent. */
export function readDeliverySmsFacts(db: Database, deliveryId: string) {
  return db
    .selectFrom('delivery_requests')
    .innerJoin('bookings', 'bookings.id', 'delivery_requests.context_id')
    .innerJoin('providers', 'providers.id', 'bookings.provider_id')
    .innerJoin('users as farmers', 'farmers.id', 'delivery_requests.requested_by')
    .leftJoin('delivery_partners', 'delivery_partners.id', 'delivery_requests.partner_id')
    .select([
      'delivery_requests.id',
      'delivery_requests.context_type',
      'delivery_requests.scheduled_for',
      'delivery_requests.load_quantity',
      'delivery_requests.load_unit',
      'delivery_requests.vehicle_type',
      'delivery_requests.distance_km',
      'delivery_requests.partner_payout_kobo',
      'delivery_requests.requested_by as farmer_id',
      'farmers.phone as farmer_phone',
      'bookings.code as booking_code',
      'providers.display_name as facility_name',
      'delivery_partners.id as partner_id',
      'delivery_partners.user_id as partner_user_id',
      'delivery_partners.phone as partner_phone',
      'delivery_partners.company_name as partner_company_name',
    ])
    .where('delivery_requests.id', '=', deliveryId)
    .executeTakeFirstOrThrow();
}

export type DeliverySmsFacts = Awaited<ReturnType<typeof readDeliverySmsFacts>>;

/** The handover code, read only to compare it or to text it to the farmer at pickup. */
export async function readHandoverCode(db: Database, deliveryId: string): Promise<string> {
  const { handover_code } = await db
    .selectFrom('delivery_requests')
    .select('handover_code')
    .where('id', '=', deliveryId)
    .executeTakeFirstOrThrow();
  return handover_code;
}
