import type { BookingStatus } from '@coldlink/shared';
import type { TransitionHooks } from '../bookings/hooks.js';
import { refundBooking, type RefundDependencies } from '../payments/refunds.js';
import type { SmsTemplateRegistry } from '../notifications/registry.js';
import { alertDeliveryCancelled, type DeliveryAlert } from './alerts.js';
import { queuePartnerCancellations } from './partnerMoves.js';
import {
  cancelUnfinishedDeliveries,
  listUnrefundedCancelledDeliveries,
  markBookingDeliveriesPaid,
} from './store.js';

/** The booking statuses that end it before storage, taking its deliveries with them. */
const bookingEndStatuses: BookingStatus[] = ['rejected', 'expired', 'cancelled', 'no_show'];

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

export interface DeliveryHookDependencies extends RefundDependencies {
  templates: SmsTemplateRegistry;
}

/**
 * A delivery requested with its booking is paid when the booking is (decision 142). A booking that
 * is rejected, expires, is cancelled or is a no-show cancels its unfinished deliveries in the same
 * transaction, queues `delivery_cancelled` to each one's partner, which the queue sends (decision
 * 148), and after the commit refunds the fee of each one that was paid.
 */
export function registerDeliveryHooks(
  hooks: TransitionHooks,
  deps: DeliveryHookDependencies,
): void {
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
        const cancelled = await cancelUnfinishedDeliveries(trx, bookingId);
        await queuePartnerCancellations(trx, deps.templates, cancelled);
      },
    });
    hooks.afterCommit({
      name: `refund_deliveries_on_${to}`,
      on: { to },
      run: ({ bookingId }) => refundCancelledDeliveries(deps, bookingId, `booking_${to}`),
    });
  }
}
