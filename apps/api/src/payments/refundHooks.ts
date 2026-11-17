import * as z from 'zod';
import type { TransitionHooks } from '../bookings/hooks.js';
import type { BookingTransition } from '../bookings/transition.js';
import { refundBooking, type RefundDependencies, type RefundOrder } from './refunds.js';

const farmerRefundSchema = z.object({ refund_kobo: z.int().nonnegative() });

/**
 * A farmer's cancellation refunds what the policy worked out under the row lock (decision 86);
 * anyone else's refunds the whole online charge (PRD 6.6).
 */
function cancellationRefund({ bookingId, actor, metadata }: BookingTransition): RefundOrder {
  if (actor.type !== 'farmer') return { bookingId, amount: 'full', reason: 'cancelled' };
  const { refund_kobo } = farmerRefundSchema.parse(metadata);
  return { bookingId, amount: refund_kobo, reason: 'farmer_cancelled' };
}

/**
 * Refunds after the commit of every transition that gives money back (PRD 6.4, 6.6): a rejection,
 * a provider who did not answer in time, and a cancellation. A refund of 0 makes no call.
 */
export function registerRefundHooks(hooks: TransitionHooks, deps: RefundDependencies): void {
  const refund = async (order: RefundOrder) => {
    if (order.amount === 0) return;
    await refundBooking(deps, order);
  };
  hooks.afterCommit({
    name: 'refund_on_reject',
    on: { to: 'rejected' },
    run: ({ bookingId }) => refund({ bookingId, amount: 'full', reason: 'rejected' }),
  });
  hooks.afterCommit({
    name: 'refund_on_provider_timeout',
    on: { from: 'pending_provider', to: 'expired' },
    run: ({ bookingId }) => refund({ bookingId, amount: 'full', reason: 'provider_timeout' }),
  });
  hooks.afterCommit({
    name: 'refund_on_cancel',
    on: { to: 'cancelled' },
    run: (transition) => refund(cancellationRefund(transition)),
  });
}
