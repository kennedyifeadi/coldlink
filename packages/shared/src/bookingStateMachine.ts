import type { BookingEventActorType, BookingStatus } from './enums.js';

type ActorsByTarget = Partial<Record<BookingStatus, readonly BookingEventActorType[]>>;

// PRD 6.5, plus a farmer cancelling before the provider accepts (the full refund of PRD 6.6), with
// the actor types that may make each transition. Anything not listed here is refused.
export const bookingTransitions: Readonly<Record<BookingStatus, Readonly<ActorsByTarget>>> = {
  payment_pending: {
    pending_provider: ['system'],
    expired: ['system'],
  },
  pending_provider: {
    confirmed: ['provider', 'admin'],
    rejected: ['provider', 'admin'],
    expired: ['system'],
    cancelled: ['farmer'],
  },
  confirmed: {
    in_storage: ['provider'],
    cancelled: ['farmer', 'provider', 'admin'],
    no_show: ['system', 'admin'],
  },
  in_storage: {
    completed: ['provider'],
  },
  rejected: {},
  expired: {},
  cancelled: {},
  no_show: {},
  completed: {},
};

/** The actor types that may move a booking from `from` to `to`; empty if the move is not listed. */
export function transitionActors(
  from: BookingStatus,
  to: BookingStatus,
): readonly BookingEventActorType[] {
  return bookingTransitions[from][to] ?? [];
}

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  actorType: BookingEventActorType,
): boolean {
  return transitionActors(from, to).includes(actorType);
}
