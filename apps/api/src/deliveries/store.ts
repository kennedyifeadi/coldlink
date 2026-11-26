import {
  startOfDayInLagos,
  type DeliveryDetails,
  type DeliveryDirection,
  type DeliveryStatus,
  type GeoPoint,
} from '@coldlink/shared';
import { sql, type ExpressionBuilder, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import type { DeliveryPrice } from './pricing.js';

export const contextTypeFor = {
  inbound: 'booking_inbound',
  outbound: 'booking_outbound',
} as const satisfies Record<DeliveryDirection, string>;

/** Not yet picked up, so the farmer may cancel it and it is cancelled with its booking. */
export const openDeliveryStatuses: DeliveryStatus[] = ['requested', 'assigned', 'accepted'];

/** Not picked up and not finished: what a booking that ends cancels (decision 144). */
export const unfinishedDeliveryStatuses: DeliveryStatus[] = [...openDeliveryStatuses, 'picked_up'];

const endedStatuses: DeliveryStatus[] = ['cancelled', 'failed'];

export function isOpenDeliveryStatus(status: string): boolean {
  return (openDeliveryStatuses as string[]).includes(status);
}

/**
 * The live rule (decision 142): a delivery is live, and work for admins, once its fee is paid and
 * until it is cancelled or fails. An unpaid request is never live.
 */
export function isLiveDelivery(eb: ExpressionBuilder<DB, 'delivery_requests'>) {
  return eb.and([
    eb('delivery_requests.paid_at', 'is not', null),
    eb('delivery_requests.status', 'not in', endedStatuses),
  ]);
}

function point({ lat, lng }: GeoPoint) {
  return sql<string>`extensions.st_setsrid(extensions.st_makepoint(${lng}, ${lat}), 4326)::extensions.geography`;
}

/** The facility's end of a delivery, as the driver is told it. */
export interface FacilityEnd extends GeoPoint {
  display_name: string;
  address_text: string;
}

export interface NewDelivery {
  bookingId: string;
  farmerId: string;
  direction: DeliveryDirection;
  details: DeliveryDetails;
  facility: FacilityEnd;
  price: DeliveryPrice;
  handoverCode: string;
}

/** Inserts a delivery `requested` and unpaid; `scheduled_for` is 00:00 in Lagos that day. */
export async function insertDelivery(trx: Transaction<DB>, delivery: NewDelivery): Promise<string> {
  const { details, facility, price } = delivery;
  const farmerEnd = { text: details.address_text, location: point(details.location) };
  const facilityEnd = {
    text: `${facility.display_name}, ${facility.address_text}`,
    location: point(facility),
  };
  const [pickup, dropoff] =
    delivery.direction === 'inbound' ? [farmerEnd, facilityEnd] : [facilityEnd, farmerEnd];
  const { id } = await trx
    .insertInto('delivery_requests')
    .values({
      context_type: contextTypeFor[delivery.direction],
      context_id: delivery.bookingId,
      requested_by: delivery.farmerId,
      pickup_text: pickup.text,
      pickup_location: pickup.location,
      dropoff_text: dropoff.text,
      dropoff_location: dropoff.location,
      contact_name: details.contact_name ?? null,
      contact_phone: details.contact_phone,
      load_description: details.load_description,
      load_quantity: details.load_quantity,
      load_unit: details.load_unit,
      distance_km: price.distance_km,
      vehicle_type: price.vehicle_type,
      fee_kobo: price.fee_kobo,
      partner_payout_kobo: price.partner_payout_kobo,
      platform_margin_kobo: price.platform_margin_kobo,
      status: 'requested',
      handover_code: delivery.handoverCode,
      scheduled_for: startOfDayInLagos(details.scheduled_for),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return id;
}

function locationOf(column: 'pickup_location' | 'dropoff_location') {
  const geometry = sql`delivery_requests.${sql.ref(column)}::extensions.geometry`;
  return [
    sql<number>`extensions.st_y(${geometry})`.as(`${column}_lat`),
    sql<number>`extensions.st_x(${geometry})`.as(`${column}_lng`),
  ] as const;
}

// Never the partner's payout, ColdLink's margin, the partner or admin notes: nothing a farmer may
// see is read without being needed (decision 146).
function selectFarmerDeliveries(db: Database, farmerId: string) {
  return db
    .selectFrom('delivery_requests')
    .innerJoin('bookings', 'bookings.id', 'delivery_requests.context_id')
    .select([
      'bookings.status as booking_status',
      'delivery_requests.id',
      'delivery_requests.context_type',
      'delivery_requests.context_id',
      'delivery_requests.status',
      'delivery_requests.paid_at',
      'delivery_requests.pickup_text',
      'delivery_requests.dropoff_text',
      'delivery_requests.contact_name',
      'delivery_requests.contact_phone',
      'delivery_requests.load_description',
      'delivery_requests.load_quantity',
      'delivery_requests.load_unit',
      'delivery_requests.distance_km',
      'delivery_requests.vehicle_type',
      'delivery_requests.fee_kobo',
      'delivery_requests.scheduled_for',
      'delivery_requests.handover_code',
      'delivery_requests.assigned_at',
      'delivery_requests.picked_up_at',
      'delivery_requests.delivered_at',
      'delivery_requests.created_at',
      ...locationOf('pickup_location'),
      ...locationOf('dropoff_location'),
    ])
    .where('delivery_requests.requested_by', '=', farmerId)
    .where('delivery_requests.context_type', 'in', Object.values(contextTypeFor));
}

export type FarmerDeliveryRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof selectFarmerDeliveries>['executeTakeFirst']>>
>;

/** The farmer's delivery, or undefined if there is none with that id or it is someone else's. */
export function findFarmerDelivery(
  db: Database,
  farmerId: string,
  deliveryId: string,
): Promise<FarmerDeliveryRow | undefined> {
  return selectFarmerDeliveries(db, farmerId)
    .where('delivery_requests.id', '=', deliveryId)
    .executeTakeFirst();
}

/** For a delivery the caller has just read or written; a missing one is a bug, not a 404. */
export async function requireFarmerDelivery(
  db: Database,
  farmerId: string,
  deliveryId: string,
): Promise<FarmerDeliveryRow> {
  const delivery = await findFarmerDelivery(db, farmerId, deliveryId);
  if (delivery === undefined) throw new Error(`Delivery ${deliveryId} not found`);
  return delivery;
}

/** Locks the delivery after its booking (the order every delivery path takes) and reads its state. */
export function lockDelivery(trx: Transaction<DB>, deliveryId: string) {
  return trx
    .selectFrom('delivery_requests')
    .select(['id', 'context_type', 'context_id', 'status', 'paid_at', 'fee_kobo', 'scheduled_for'])
    .where('id', '=', deliveryId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

export type LockedDelivery = Awaited<ReturnType<typeof lockDelivery>>;

export function directionOf(contextType: string): DeliveryDirection {
  if (contextType === contextTypeFor.inbound) return 'inbound';
  if (contextType === contextTypeFor.outbound) return 'outbound';
  throw new Error(`Not a booking delivery: ${contextType}`);
}

/**
 * The booking's deliveries in one direction that are neither cancelled nor failed, paid or not,
 * oldest first. Read under the booking's lock.
 */
export function listActiveDeliveries(
  trx: Transaction<DB>,
  bookingId: string,
  direction: DeliveryDirection,
) {
  return trx
    .selectFrom('delivery_requests')
    .select(['id', 'paid_at'])
    .where('context_type', '=', contextTypeFor[direction])
    .where('context_id', '=', bookingId)
    .where('status', 'not in', endedStatuses)
    .orderBy('created_at')
    .execute();
}

/** Cancels deliveries by id; returns those it changed. */
export function cancelDeliveries(trx: Transaction<DB>, ids: readonly string[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return trx
    .updateTable('delivery_requests')
    .set({ status: 'cancelled' })
    .where('id', 'in', ids)
    .returning(['id', 'paid_at'])
    .execute();
}

function bookingDeliveries(db: Database, bookingId: string) {
  return db
    .selectFrom('delivery_requests')
    .where('context_type', 'in', Object.values(contextTypeFor))
    .where('context_id', '=', bookingId);
}

/** Cancels every delivery of a booking that has not been delivered, failed or been cancelled. */
export function cancelUnfinishedDeliveries(trx: Transaction<DB>, bookingId: string) {
  return trx
    .updateTable('delivery_requests')
    .set({ status: 'cancelled' })
    .where('context_type', 'in', Object.values(contextTypeFor))
    .where('context_id', '=', bookingId)
    .where('status', 'in', unfinishedDeliveryStatuses)
    .returning(['id', 'paid_at'])
    .execute();
}

/** Marks the deliveries requested with a booking paid, once the booking's own charge is. */
export async function markBookingDeliveriesPaid(
  trx: Transaction<DB>,
  bookingId: string,
): Promise<void> {
  await trx
    .updateTable('delivery_requests')
    .set({ paid_at: sql<Date>`now()` })
    .where('context_type', 'in', Object.values(contextTypeFor))
    .where('context_id', '=', bookingId)
    .where('status', '=', 'requested')
    .where('paid_at', 'is', null)
    .execute();
}

/**
 * The booking's paid deliveries that were cancelled and have no refund row yet: the ones a booking
 * that ended still owes a refund for.
 */
export function listUnrefundedCancelledDeliveries(db: Database, bookingId: string) {
  return bookingDeliveries(db, bookingId)
    .select(['delivery_requests.id', 'delivery_requests.fee_kobo'])
    .where('delivery_requests.status', '=', 'cancelled')
    .where('delivery_requests.paid_at', 'is not', null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('payments')
            .select('payments.id')
            .where('payments.purpose', '=', 'refund')
            .whereRef('payments.delivery_request_id', '=', 'delivery_requests.id'),
        ),
      ),
    )
    .orderBy('delivery_requests.created_at')
    .execute();
}

/** What cancelling the booking now refunds of its deliveries: the fees of the paid, unfinished ones. */
export async function unfinishedPaidDeliveryFees(db: Database, bookingId: string): Promise<number> {
  const { total } = await bookingDeliveries(db, bookingId)
    .select(sql<string>`coalesce(sum(delivery_requests.fee_kobo), 0)`.as('total'))
    .where('delivery_requests.status', 'in', unfinishedDeliveryStatuses)
    .where('delivery_requests.paid_at', 'is not', null)
    .executeTakeFirstOrThrow();
  return Number(total);
}
