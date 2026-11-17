import { bookingStatusSchema, type BookingStatus } from '@coldlink/shared';
import type { Transaction } from 'kysely';
import type { DB } from '../db/schema.js';
import { AppError } from '../errors.js';
import type { TransitionHooks } from './hooks.js';
import { lockBookingForProvider } from './providerStore.js';
import {
  BookingNotFoundError,
  transitionBooking,
  type BookingActor,
  type TransitionResult,
} from './transition.js';

export type ProviderAction = 'accept' | 'reject' | 'check_in' | 'collect';

const targets: Record<ProviderAction, BookingStatus> = {
  accept: 'confirmed',
  reject: 'rejected',
  check_in: 'in_storage',
  collect: 'completed',
};

// Decision 52: an admin may answer for a provider, but only the provider at the facility can
// confirm the produce arrived or left.
const adminActions: ReadonlySet<ProviderAction> = new Set(['accept', 'reject']);

export interface ProviderActionRequest {
  bookingId: string;
  action: ProviderAction;
  caller: { userId: string; isAdmin: boolean };
  /** Today in Lagos, which a check-in date is compared with. */
  today: string;
  reason?: string;
}

interface LockedBooking {
  status: BookingStatus;
  start_date: string;
  response_overdue: boolean;
  owned: boolean;
}

function actorFor(
  { action, caller }: ProviderActionRequest,
  { owned }: LockedBooking,
): BookingActor | undefined {
  if (owned) return { type: 'provider', id: caller.userId };
  if (caller.isAdmin && adminActions.has(action)) return { type: 'admin', id: caller.userId };
  return undefined;
}

// Only for the status the rule applies to; any other status gets the state machine's 409.
function assertTimely(
  { bookingId, action, today }: ProviderActionRequest,
  booking: LockedBooking,
): void {
  const answering = action === 'accept' || action === 'reject';
  if (answering && booking.status === 'pending_provider' && booking.response_overdue) {
    throw new AppError('conflict', 'The time to answer this booking has passed', {
      booking_id: bookingId,
    });
  }
  if (action === 'check_in' && booking.status === 'confirmed' && today < booking.start_date) {
    throw new AppError('conflict', 'Produce can be checked in from the start date', {
      booking_id: bookingId,
      start_date: booking.start_date,
    });
  }
}

/**
 * Makes a provider's or admin's move on a booking inside the caller's transaction, under the
 * booking's row lock. A booking the caller may not act on is the same 404 as an unknown one, so
 * ids cannot be probed; a move its status, deadline or dates do not allow is a 409.
 */
export async function performProviderAction(
  trx: Transaction<DB>,
  hooks: TransitionHooks,
  request: ProviderActionRequest,
): Promise<TransitionResult> {
  const { bookingId, action, caller, reason } = request;
  const row = await lockBookingForProvider(trx, bookingId, caller.userId);
  if (row === undefined) throw new BookingNotFoundError(bookingId);
  const booking: LockedBooking = {
    ...row,
    status: bookingStatusSchema.parse(row.status),
    owned: Boolean(row.owned),
  };
  const actor = actorFor(request, booking);
  if (actor === undefined) throw new BookingNotFoundError(bookingId);
  assertTimely(request, booking);
  return transitionBooking(trx, hooks, {
    bookingId,
    to: targets[action],
    actor,
    ...(reason === undefined ? {} : { reason }),
  });
}
