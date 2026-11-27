import {
  capacityUnitSchema,
  deliveryStatusSchema,
  HANDOVER_CODE_MAX_ATTEMPTS,
  maskPhone,
  todayInLagos,
  vehicleTypeSchema,
  type AdminDelivery,
  type PartnerDeliveryJob,
} from '@coldlink/shared';
import type { AdminDeliveryRow, PartnerJobRow } from './partnerStore.js';
import { directionOf } from './store.js';

function scheduledDay(scheduledFor: Date | null): string {
  if (scheduledFor === null) throw new Error('A delivery has no scheduled day');
  return todayInLagos(scheduledFor);
}

export function handoverAttemptsLeft(failedAttempts: number): number {
  return Math.max(0, HANDOVER_CODE_MAX_ATTEMPTS - failedAttempts);
}

// The query already leaves out what the partner may not see at this status (decision 151).
export function toPartnerJob(row: PartnerJobRow): PartnerDeliveryJob {
  return {
    booking_code: row.booking_code,
    direction: directionOf(row.context_type),
    status: deliveryStatusSchema.parse(row.status),
    scheduled_for: scheduledDay(row.scheduled_for),
    facility: { name: row.facility_name, lga: row.facility_lga, address: row.facility_address },
    farmer_address: row.farmer_address,
    contact:
      row.contact_phone === null ? null : { name: row.contact_name, phone: row.contact_phone },
    load_description: row.load_description,
    load_quantity: row.load_quantity,
    load_unit: capacityUnitSchema.parse(row.load_unit),
    vehicle_type: vehicleTypeSchema.parse(row.vehicle_type),
    distance_km: row.distance_km,
    payout_kobo: row.partner_payout_kobo,
    handover_attempts_left: handoverAttemptsLeft(row.handover_failed_attempts),
  };
}

/**
 * Coverage is advisory (decision 153): only the facility's LGA is known, since the farmer's end is
 * a typed address and a point. A partner listing no LGAs, or a facility with none, is not flagged.
 */
export function coversFacilityLga(coverageLgas: readonly string[], facilityLga: string | null) {
  if (coverageLgas.length === 0 || facilityLga === null) return true;
  const lga = facilityLga.trim().toLowerCase();
  return coverageLgas.some((covered) => covered.trim().toLowerCase() === lga);
}

export function toAdminDelivery(row: AdminDeliveryRow): AdminDelivery {
  return {
    id: row.id,
    booking_id: row.context_id,
    booking_code: row.booking_code,
    direction: directionOf(row.context_type),
    status: deliveryStatusSchema.parse(row.status),
    paid: row.paid_at !== null,
    pickup_text: row.pickup_text,
    dropoff_text: row.dropoff_text,
    contact_name: row.contact_name,
    contact_phone_masked: maskPhone(row.contact_phone),
    load_description: row.load_description,
    load_quantity: row.load_quantity,
    load_unit: capacityUnitSchema.parse(row.load_unit),
    vehicle_type: vehicleTypeSchema.parse(row.vehicle_type),
    distance_km: row.distance_km,
    fee_kobo: row.fee_kobo,
    partner_payout_kobo: row.partner_payout_kobo,
    platform_margin_kobo: row.platform_margin_kobo,
    scheduled_for: scheduledDay(row.scheduled_for),
    assigned_at: row.assigned_at?.toISOString() ?? null,
    picked_up_at: row.picked_up_at?.toISOString() ?? null,
    delivered_at: row.delivered_at?.toISOString() ?? null,
    handover_failed_attempts: row.handover_failed_attempts,
    partner:
      row.partner_id === null || row.partner_company_name === null
        ? null
        : {
            id: row.partner_id,
            company_name: row.partner_company_name,
            covers_facility_lga: coversFacilityLga(
              row.partner_coverage_lgas ?? [],
              row.facility_lga,
            ),
          },
  };
}
