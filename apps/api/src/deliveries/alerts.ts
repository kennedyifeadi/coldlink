import type { BookingStatus } from '@coldlink/shared';
import type { Logger } from 'pino';

// The error-level alerts an admin acts on (PRD 7.7 rules), as notifications/send.ts raises "SMS
// delivery failed". Each names the booking and the delivery, never a phone number or the code.

export interface DeliveryAlert {
  bookingId: string;
  deliveryRequestId: string;
  /** What cancelled it: the farmer, or the booking ending. */
  cause: 'farmer_cancelled' | `booking_${BookingStatus}`;
}

/** A paid delivery was cancelled, so a partner may already be on the job (decision 144). */
export function alertDeliveryCancelled(logger: Logger, alert: DeliveryAlert): void {
  logger.error(alert, 'Delivery cancelled');
}

export interface PartnerAlert {
  bookingId: string;
  deliveryRequestId: string;
  partnerId: string;
}

/** The partner declined, so the job is back in the queue for another assignment (decision 147). */
export function alertDeliveryDeclined(logger: Logger, alert: PartnerAlert): void {
  logger.error(alert, 'Delivery declined');
}

/** The fifth wrong handover code: the link takes no more, and someone must call (decision 150). */
export function alertHandoverLocked(logger: Logger, alert: PartnerAlert): void {
  logger.error(alert, 'Delivery handover locked');
}
