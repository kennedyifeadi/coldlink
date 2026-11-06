import {
  bookingStatusSchema,
  cancelledBySchema,
  transitionActors,
  type BookingEventActorType,
  type BookingStatus,
} from '@coldlink/shared';
import { sql, type Transaction, type UpdateObject } from 'kysely';
import type { DB, JsonObject } from '../db/schema.js';
import { AppError } from '../errors.js';

/** Who made a change. Only the system acts without an id (PRD 5.6). */
export type BookingActor =
  { type: 'system'; id?: null } | { type: Exclude<BookingEventActorType, 'system'>; id: string };

export interface TransitionRequest {
  bookingId: string;
  to: BookingStatus;
  actor: BookingActor;
  /** Saved as `cancel_reason` on a cancellation, and as `reason` in the event's metadata. */
  reason?: string;
  metadata?: JsonObject;
}

/** A status change that has been written, as hooks and callers see it. */
export interface BookingTransition {
  bookingId: string;
  from: BookingStatus;
  to: BookingStatus;
  actor: BookingActor;
  eventId: string;
  metadata: JsonObject;
}

export class BookingNotFoundError extends AppError {
  override readonly name = 'BookingNotFoundError';

  constructor(readonly bookingId: string) {
    super('not_found', 'Booking not found', { booking_id: bookingId });
  }
}

export class BookingTransitionError extends AppError {
  override readonly name = 'BookingTransitionError';

  constructor(
    readonly reason: 'not_a_transition' | 'actor_not_allowed',
    readonly bookingId: string,
    readonly from: BookingStatus,
    readonly to: BookingStatus,
    readonly actorType: BookingEventActorType,
  ) {
    super(
      'conflict',
      reason === 'not_a_transition'
        ? `A ${from} booking cannot become ${to}`
        : `A ${actorType} cannot move a booking from ${from} to ${to}`,
      { booking_id: bookingId, from, to, actor_type: actorType },
    );
  }
}

function assertAllowed(
  bookingId: string,
  from: BookingStatus,
  { to, actor }: TransitionRequest,
): void {
  const actors = transitionActors(from, to);
  if (actors.length === 0) {
    throw new BookingTransitionError('not_a_transition', bookingId, from, to, actor.type);
  }
  if (!actors.includes(actor.type)) {
    throw new BookingTransitionError('actor_not_allowed', bookingId, from, to, actor.type);
  }
}

// The columns each target status owns; the database checks require cancelled_by exactly when the
// status is cancelled.
function statusFields({ to, actor, reason }: TransitionRequest): UpdateObject<DB, 'bookings'> {
  switch (to) {
    case 'cancelled':
      return { cancelled_by: cancelledBySchema.parse(actor.type), cancel_reason: reason ?? null };
    case 'in_storage':
      return { checked_in_at: sql<Date>`now()` };
    case 'completed':
      return { collected_at: sql<Date>`now()` };
    default:
      return {};
  }
}

/**
 * Moves a booking to `request.to` inside the caller's transaction: locks the booking row, refuses
 * a move or actor the state machine does not allow, updates the status and the fields it owns, and
 * writes the `booking_events` row. Throws `BookingNotFoundError` or `BookingTransitionError` and
 * changes nothing when it refuses.
 */
export async function transitionBooking(
  trx: Transaction<DB>,
  request: TransitionRequest,
): Promise<BookingTransition> {
  const { bookingId, to, actor } = request;
  const booking = await trx
    .selectFrom('bookings')
    .select('status')
    .where('id', '=', bookingId)
    .forUpdate()
    .executeTakeFirst();
  if (booking === undefined) throw new BookingNotFoundError(bookingId);
  const from = bookingStatusSchema.parse(booking.status);
  assertAllowed(bookingId, from, request);

  await trx
    .updateTable('bookings')
    .set({ status: to, ...statusFields(request) })
    .where('id', '=', bookingId)
    .executeTakeFirstOrThrow();
  const metadata: JsonObject =
    request.reason === undefined
      ? { ...request.metadata }
      : { ...request.metadata, reason: request.reason };
  const { id: eventId } = await trx
    .insertInto('booking_events')
    .values({
      booking_id: bookingId,
      from_status: from,
      to_status: to,
      actor_type: actor.type,
      actor_id: actor.id ?? null,
      metadata: JSON.stringify(metadata),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { bookingId, from, to, actor, eventId, metadata };
}
