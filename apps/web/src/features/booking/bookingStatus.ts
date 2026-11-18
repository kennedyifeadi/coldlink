import type { BookingStatus } from '@coldlink/shared';

/** Waiting on someone, going ahead, over and done, or ended without storage. */
export type StatusTone = 'waiting' | 'active' | 'done' | 'ended';

export const STATUS_TONES: Record<BookingStatus, StatusTone> = {
  payment_pending: 'waiting',
  pending_provider: 'waiting',
  confirmed: 'active',
  in_storage: 'active',
  completed: 'done',
  rejected: 'ended',
  expired: 'ended',
  cancelled: 'ended',
  no_show: 'ended',
};

/** Book again is not offered for a booking still waiting to be paid: that one can be paid. */
export const canBookAgain = ({ status }: { status: BookingStatus }) => status !== 'payment_pending';
