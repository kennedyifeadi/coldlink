import type { RateBookingInput } from '@coldlink/shared';
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { AppError } from '../errors.js';
import { lockProvider } from '../providers/store.js';
import { BookingNotFoundError } from './transition.js';

export interface RatingRequest extends RateBookingInput {
  farmerId: string;
  bookingId: string;
}

// `completed` is final (bookingTransitions), so the status read here cannot change before the
// rating commits and the booking row needs no lock.
function findFarmerBookingToRate(trx: Database, farmerId: string, bookingId: string) {
  return trx
    .selectFrom('bookings')
    .select(['status', 'provider_id'])
    .where('id', '=', bookingId)
    .where('farmer_id', '=', farmerId)
    .executeTakeFirst();
}

/** Inserts the rating, or returns false when the booking already has one. */
async function insertRating(
  trx: Database,
  { bookingId, farmerId, stars, comment }: RatingRequest,
  providerId: string,
): Promise<boolean> {
  // on conflict do nothing, not a caught unique violation: an error would abort the transaction.
  const row = await trx
    .insertInto('ratings')
    .values({
      booking_id: bookingId,
      farmer_id: farmerId,
      provider_id: providerId,
      stars,
      comment,
    })
    .onConflict((oc) => oc.column('booking_id').doNothing())
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Recomputes the provider's average and count from every rating it has, in SQL, so the average
 * is rounded exactly as numeric(3,2) stores it. Run under the provider's row lock: a statement
 * started after the lock sees every rating committed before it.
 */
async function recomputeProviderRating(trx: Database, providerId: string): Promise<void> {
  await trx
    .updateTable('providers')
    .set({
      avg_rating: sql<string>`(
        select round(avg(r.stars), 2) from public.ratings r
        where r.provider_id = ${providerId}
      )`,
      rating_count: sql<number>`(
        select count(*)::int from public.ratings r where r.provider_id = ${providerId}
      )`,
    })
    .where('id', '=', providerId)
    .executeTakeFirstOrThrow();
}

/**
 * Records the farmer's rating of a completed booking and recomputes the facility's average and
 * count, inside the caller's transaction (PRD 6.7). Someone else's booking is the same 404 as an
 * unknown one; a booking that is not completed, or already rated, is a 409.
 */
export async function rateBooking(trx: Transaction<DB>, request: RatingRequest): Promise<void> {
  const { farmerId, bookingId } = request;
  const booking = await findFarmerBookingToRate(trx, farmerId, bookingId);
  if (booking === undefined) throw new BookingNotFoundError(bookingId);
  if (booking.status !== 'completed') {
    throw new AppError('conflict', 'Only a completed booking can be rated', {
      booking_id: bookingId,
      status: booking.status,
    });
  }
  // Ratings for one facility recompute one after the other, so none is left out of the average.
  await lockProvider(trx, booking.provider_id);
  if (!(await insertRating(trx, request, booking.provider_id))) {
    throw new AppError('conflict', 'This booking has already been rated', {
      booking_id: bookingId,
    });
  }
  await recomputeProviderRating(trx, booking.provider_id);
}

/** The farmer's rating of the booking, if they have rated it. */
export function findBookingRating(db: Database, bookingId: string) {
  return db
    .selectFrom('ratings')
    .select(['stars', 'comment', 'created_at'])
    .where('booking_id', '=', bookingId)
    .executeTakeFirst();
}

export type BookingRatingRow = NonNullable<Awaited<ReturnType<typeof findBookingRating>>>;
