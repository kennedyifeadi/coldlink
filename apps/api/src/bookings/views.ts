import {
  bookingStatusSchema,
  cancelledBySchema,
  capacityUnitSchema,
  type FarmerBooking,
  type FarmerBookingSummary,
  type ProviderBooking,
  type ProviderBookingRequest,
} from '@coldlink/shared';
import type { ProviderBookingRow } from './providerStore.js';
import type { FarmerBookingRow } from './store.js';

function isoOrNull(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

// The database checks hold the text columns to these values; parsing narrows their types.
export function toFarmerBookingSummary(row: FarmerBookingRow): FarmerBookingSummary {
  return {
    id: row.id,
    code: row.code,
    status: bookingStatusSchema.parse(row.status),
    provider: {
      id: row.provider_id,
      display_name: row.provider_display_name,
      lga: row.provider_lga,
    },
    crop: { id: row.crop_id, name: row.crop_name },
    quantity: row.quantity,
    capacity_unit: capacityUnitSchema.parse(row.capacity_unit),
    start_date: row.start_date,
    duration_days: row.duration_days,
    end_date: row.end_date,
    total_charged_online_kobo: row.total_charged_online_kobo,
    balance_due_kobo: row.balance_due_kobo,
    created_at: row.created_at.toISOString(),
  };
}

export function toFarmerBooking(row: FarmerBookingRow): FarmerBooking {
  const summary = toFarmerBookingSummary(row);
  return {
    ...summary,
    provider: {
      ...summary.provider,
      address_text: row.provider_address_text,
      landmark: row.provider_landmark,
    },
    unit_price_kobo: row.unit_price_kobo,
    storage_subtotal_kobo: row.storage_subtotal_kobo,
    service_fee_kobo: row.service_fee_kobo,
    deposit_kobo: row.deposit_kobo,
    delivery_fee_kobo: row.delivery_fee_kobo,
    payment_expires_at: isoOrNull(row.payment_expires_at),
    provider_response_due_at: isoOrNull(row.provider_response_due_at),
    checked_in_at: isoOrNull(row.checked_in_at),
    collected_at: isoOrNull(row.collected_at),
    cancelled_by: row.cancelled_by === null ? null : cancelledBySchema.parse(row.cancelled_by),
    cancel_reason: row.cancel_reason,
  };
}

/** PRD 6.1's provider payout, from the booking's snapshot. */
function payoutKobo(row: Pick<ProviderBookingRow, 'deposit_kobo' | 'commission_kobo'>): number {
  return row.deposit_kobo - row.commission_kobo;
}

export function toProviderBooking(row: ProviderBookingRow): ProviderBooking {
  return {
    id: row.id,
    code: row.code,
    status: bookingStatusSchema.parse(row.status),
    provider: { id: row.provider_id, display_name: row.provider_display_name },
    crop: { id: row.crop_id, name: row.crop_name },
    quantity: row.quantity,
    capacity_unit: capacityUnitSchema.parse(row.capacity_unit),
    start_date: row.start_date,
    duration_days: row.duration_days,
    end_date: row.end_date,
    balance_due_kobo: row.balance_due_kobo,
    payout_kobo: payoutKobo(row),
    provider_response_due_at: isoOrNull(row.provider_response_due_at),
    checked_in_at: isoOrNull(row.checked_in_at),
    collected_at: isoOrNull(row.collected_at),
  };
}

export function toProviderBookingRequest(row: ProviderBookingRow): ProviderBookingRequest {
  return {
    facility_name: row.provider_display_name,
    crop_name: row.crop_name,
    quantity: row.quantity,
    capacity_unit: capacityUnitSchema.parse(row.capacity_unit),
    start_date: row.start_date,
    duration_days: row.duration_days,
    end_date: row.end_date,
    payout_kobo: payoutKobo(row),
  };
}
