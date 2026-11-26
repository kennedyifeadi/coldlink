import type { BookingStatus } from '@coldlink/shared';
import type { Logger } from 'pino';
import type { TransitionHooks } from '../bookings/hooks.js';
import { refundBooking, type RefundDependencies } from '../payments/refunds.js';
import {
  cancelUnfinishedDeliveries,
  listUnrefundedCancelledDeliveries,
  markBookingDeliveriesPaid,
} from './store.js';

/** The booking statuses that end it before storage, taking its deliveries with them. */
const bookingEndStatuses: BookingStatus[] = ['rejected', 'expired', 'cancelled', 'no_show'];

export interface DeliveryAlert {
  bookingId: string;
  deliveryRequestId: string;
  /** What cancelled it: the farmer, or the booking ending. */
  cause: 'farmer_cancelled' | `booking_${BookingStatus}`;
}

/**
 * The error-level alert an admin acts on (PRD 7.7 rules), as notifications/send.ts raises for a
 * failed SMS: a paid delivery was cancelled, so a partner may already be on the job. A refund that
 * fails raises its own, "Paystack refund failed".
 */
export function alertDeliveryCancelled(logger: Logger, alert: DeliveryAlert): void {
  logger.error(alert, 'Delivery cancelled');
}

/**
 * Refunds the fee of each paid delivery of the booking that was cancelled and has no refund yet,
 * raising the admin alert for each. Each delivery is refunded once (decision 144): against its own
 * charge, or as part of the booking's if it was paid with it.
 */
export async function refundCancelledDeliveries(
  deps: RefundDependencies,
  bookingId: string,
  cause: DeliveryAlert['cause'],
): Promise<void> {
  const deliveries = await listUnrefundedCancelledDeliveries(deps.db, bookingId);
  for (const delivery of deliveries) {
    alertDeliveryCancelled(deps.logger, { bookingId, deliveryRequestId: delivery.id, cause });
    await refundBooking(deps, {
      bookingId,
      deliveryRequestId: delivery.id,
      amount: delivery.fee_kobo,
      reason: 'delivery_cancelled',
    });
  }
}

/**
 * A delivery requested with its booking is paid when the booking is (decision 142). A booking that
 * is rejected, expires, is cancelled or is a no-show cancels its unfinished deliveries in the same
 * transaction, and after the commit refunds the fee of each one that was paid.
 */
export function registerDeliveryHooks(hooks: TransitionHooks, deps: RefundDependencies): void {
  hooks.inTransaction({
    name: 'deliveries_paid_with_booking',
    on: { from: 'payment_pending', to: 'pending_provider' },
    run: (trx, { bookingId }) => markBookingDeliveriesPaid(trx, bookingId),
  });
  for (const to of bookingEndStatuses) {
    hooks.inTransaction({
      name: `cancel_deliveries_on_${to}`,
      on: { to },
      run: async (trx, { bookingId }) => {
        await cancelUnfinishedDeliveries(trx, bookingId);
      },
    });
    hooks.afterCommit({
      name: `refund_deliveries_on_${to}`,
      on: { to },
      run: ({ bookingId }) => refundCancelledDeliveries(deps, bookingId, `booking_${to}`),
    });
  }
}
