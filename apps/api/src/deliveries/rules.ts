import {
  acceptsDelivery,
  deliveryWindow,
  isInWindow,
  todayInLagos,
  type BookingDates,
  type BookingStatus,
  type DeliveryDirection,
} from '@coldlink/shared';

/**
 * Whether a delivery requested after booking can still be paid for, and so become live: its
 * booking still takes deliveries that way and its day is still inside the window (decision 143).
 */
export function isStillPayable(
  direction: DeliveryDirection,
  scheduledFor: Date | null,
  booking: BookingDates & { status: BookingStatus },
  now: Date,
): boolean {
  if (scheduledFor === null || !acceptsDelivery(direction, booking.status)) return false;
  const window = deliveryWindow(direction, booking, now);
  return window !== undefined && isInWindow(window, todayInLagos(scheduledFor));
}
