import type { BookingStatus } from './enums.js';

// PRD 6.5. Any transition not listed here is refused.
export const bookingTransitions: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  payment_pending: ['pending_provider', 'expired'],
  pending_provider: ['confirmed', 'rejected', 'expired'],
  confirmed: ['in_storage', 'cancelled', 'no_show'],
  in_storage: ['completed'],
  rejected: [],
  expired: [],
  cancelled: [],
  no_show: [],
  completed: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return bookingTransitions[from].includes(to);
}
