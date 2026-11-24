import * as z from 'zod';
import type { BookingStatus } from './enums.js';

// A farmer's rating of the facility for one completed booking (PRD 5.9, 6.7, 7.8).

/** The longest comment, counted after trimming (decision 128). */
export const RATING_COMMENT_MAX_LENGTH = 500;

export const ratingStarsSchema = z.int().min(1).max(5);

export const rateBookingBodySchema = z.strictObject({
  stars: ratingStarsSchema,
  /** Trimmed; a blank or missing comment is stored as null. */
  comment: z
    .string()
    .trim()
    .max(RATING_COMMENT_MAX_LENGTH)
    .optional()
    .transform((comment) => (comment === undefined || comment === '' ? null : comment)),
});
export type RateBookingBody = z.input<typeof rateBookingBodySchema>;
export type RateBookingInput = z.output<typeof rateBookingBodySchema>;

export const bookingRatingSchema = z.strictObject({
  stars: ratingStarsSchema,
  comment: z.string().nullable(),
  created_at: z.iso.datetime(),
});
export type BookingRating = z.infer<typeof bookingRatingSchema>;

/** Whether the farmer can rate the booking now: once completed, and only once. */
export function canRateBooking(booking: {
  status: BookingStatus;
  rating: BookingRating | null;
}): boolean {
  return booking.status === 'completed' && booking.rating === null;
}

/**
 * The web app's rating screen, which the `rating_request` SMS links to (decision 129). The link
 * carries no token: the farmer signs in as usual and comes back here.
 */
export const BOOKING_RATING_ROUTE = '/bookings/:bookingId/rate';

export function bookingRatingPath(bookingId: string): string {
  return BOOKING_RATING_ROUTE.replace(':bookingId', () => encodeURIComponent(bookingId));
}
