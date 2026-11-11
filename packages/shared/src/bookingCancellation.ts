import { startOfDayInLagos } from './dates.js';
import type { BookingStatus } from './enums.js';

const MS_PER_HOUR = 60 * 60 * 1000;

/** The statuses a farmer may cancel from (decision 52). */
export type FarmerCancellableStatus = Extract<BookingStatus, 'pending_provider' | 'confirmed'>;

export function isFarmerCancellable(status: BookingStatus): status is FarmerCancellableStatus {
  return status === 'pending_provider' || status === 'confirmed';
}

export interface FarmerCancellation {
  status: FarmerCancellableStatus;
  start_date: string;
  deposit_kobo: number;
  total_charged_online_kobo: number;
}

/**
 * What a farmer's cancellation refunds of the online payment (PRD 6.6): all of it before the
 * provider accepts; after that, the deposit but not the service fee if it is at least
 * `freeCancelHours` before 00:00 in Lagos on the start date, and nothing later.
 */
export function farmerCancellationRefundKobo(
  booking: FarmerCancellation,
  now: Date,
  freeCancelHours: number,
): number {
  if (booking.status === 'pending_provider') return booking.total_charged_online_kobo;
  const msBeforeStart = startOfDayInLagos(booking.start_date).getTime() - now.getTime();
  return msBeforeStart >= freeCancelHours * MS_PER_HOUR ? booking.deposit_kobo : 0;
}
