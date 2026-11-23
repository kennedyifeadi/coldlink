import {
  bookingStatusSchema,
  cancelledBySchema,
  capacityUnitSchema,
  depositRefundEndsAt,
  farmerCancellationRefundKobo,
  isFarmerCancellable,
  type FarmerBooking,
  type FarmerBookingSummary,
  type FarmerCancellationPreview,
  type BookingStatusChange,
  type ProviderBooking,
  type ProviderBookingDetail,
  type ProviderBookingRequest,
} from '@coldlink/shared';
import type { ProviderBookingDetailRows, ProviderBookingRow } from './providerStore.js';
import type { BookingStatusChangeRow, FarmerBookingDetail, FarmerBookingRow } from './store.js';

function isoOrNull(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

/** When the booking entered each status, never who moved it (decision 106). */
function toStatusHistory(history: BookingStatusChangeRow[]): BookingStatusChange[] {
  return history.map((event) => ({
    status: bookingStatusSchema.parse(event.to_status),
    at: event.created_at.toISOString(),
  }));
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

export interface CancellationTerms {
  now: Date;
  freeCancelHours: number;
}

type CancellableFields = Pick<
  FarmerBookingRow,
  'status' | 'start_date' | 'deposit_kobo' | 'total_charged_online_kobo'
>;

/** What a farmer's cancellation refunds at `now` (PRD 6.6); the cancel route refunds this. */
export function farmerCancellationPreview(
  row: CancellableFields,
  { now, freeCancelHours }: CancellationTerms,
): FarmerCancellationPreview {
  const status = bookingStatusSchema.parse(row.status);
  if (!isFarmerCancellable(status)) return { allowed: false };
  return {
    allowed: true,
    refund_kobo: farmerCancellationRefundKobo({ ...row, status }, now, freeCancelHours),
    deposit_refund_ends_at:
      status === 'confirmed'
        ? depositRefundEndsAt(row.start_date, freeCancelHours).toISOString()
        : null,
  };
}

export function toFarmerBooking(
  { booking: row, history }: FarmerBookingDetail,
  terms: CancellationTerms,
): FarmerBooking {
  const summary = toFarmerBookingSummary(row);
  return {
    ...summary,
    provider: {
      ...summary.provider,
      address_text: row.provider_address_text,
      landmark: row.provider_landmark,
      phone: row.provider_phone,
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
    status_history: toStatusHistory(history),
    cancellation: farmerCancellationPreview(row, terms),
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

export function toProviderBookingDetail({
  booking,
  history,
}: ProviderBookingDetailRows): ProviderBookingDetail {
  return { ...toProviderBooking(booking), status_history: toStatusHistory(history) };
}

export function toProviderBookingRequest(row: ProviderBookingRow): ProviderBookingRequest {
  return {
    code: row.code,
    facility_name: row.provider_display_name,
    crop_name: row.crop_name,
    quantity: row.quantity,
    capacity_unit: capacityUnitSchema.parse(row.capacity_unit),
    start_date: row.start_date,
    duration_days: row.duration_days,
    end_date: row.end_date,
    payout_kobo: payoutKobo(row),
    response_due_at: isoOrNull(row.provider_response_due_at),
  };
}
