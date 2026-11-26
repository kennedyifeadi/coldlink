import {
  capacityUnitSchema,
  deliveryStatusSchema,
  maskPhone,
  todayInLagos,
  vehicleTypeSchema,
  type DeliveryCancellationPreview,
  type FarmerDelivery,
} from '@coldlink/shared';
import { directionOf, isOpenDeliveryStatus, type FarmerDeliveryRow } from './store.js';

function isoOrNull(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

/**
 * The farmer may cancel until pickup, and gets the whole fee back if it was paid (decision 144); a
 * delivery asked for with a booking still awaiting payment goes with the booking instead.
 */
export function deliveryCancellationPreview(
  row: Pick<FarmerDeliveryRow, 'status' | 'paid_at' | 'fee_kobo' | 'booking_status'>,
): DeliveryCancellationPreview {
  if (!isOpenDeliveryStatus(row.status) || row.booking_status === 'payment_pending') {
    return { allowed: false };
  }
  return { allowed: true, refund_kobo: row.paid_at === null ? 0 : row.fee_kobo };
}

// The database checks hold the text columns to these values; parsing narrows their types.
export function toFarmerDelivery(row: FarmerDeliveryRow): FarmerDelivery {
  if (row.scheduled_for === null) throw new Error(`Delivery ${row.id} has no scheduled day`);
  return {
    id: row.id,
    booking_id: row.context_id,
    direction: directionOf(row.context_type),
    status: deliveryStatusSchema.parse(row.status),
    paid: row.paid_at !== null,
    pickup_text: row.pickup_text,
    pickup_location: { lat: row.pickup_location_lat, lng: row.pickup_location_lng },
    dropoff_text: row.dropoff_text,
    dropoff_location: { lat: row.dropoff_location_lat, lng: row.dropoff_location_lng },
    contact_name: row.contact_name,
    contact_phone_masked: maskPhone(row.contact_phone),
    load_description: row.load_description,
    load_quantity: row.load_quantity,
    load_unit: capacityUnitSchema.parse(row.load_unit),
    distance_km: row.distance_km,
    vehicle_type: vehicleTypeSchema.parse(row.vehicle_type),
    fee_kobo: row.fee_kobo,
    scheduled_for: todayInLagos(row.scheduled_for),
    handover_code: row.handover_code,
    assigned_at: isoOrNull(row.assigned_at),
    picked_up_at: isoOrNull(row.picked_up_at),
    delivered_at: isoOrNull(row.delivered_at),
    created_at: row.created_at.toISOString(),
    cancellation: deliveryCancellationPreview(row),
  };
}
