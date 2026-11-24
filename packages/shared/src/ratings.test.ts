import { describe, expect, it } from 'vitest';
import { bookingStatuses } from './enums.js';
import {
  BOOKING_RATING_ROUTE,
  bookingRatingPath,
  bookingRatingSchema,
  canRateBooking,
  RATING_COMMENT_MAX_LENGTH,
  rateBookingBodySchema,
} from './ratings.js';

function issuePaths(body: unknown): string[] {
  const result = rateBookingBodySchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('rateBookingBodySchema', () => {
  it.each([1, 2, 3, 4, 5])('accepts %i stars with no comment, as a null comment', (stars) => {
    expect(rateBookingBodySchema.parse({ stars })).toEqual({ stars, comment: null });
  });

  it.each([0, 6, -1, 3.5, '4', null])('refuses %j stars', (stars) => {
    expect(issuePaths({ stars })).toEqual(['stars']);
  });

  it('needs the stars', () => {
    expect(issuePaths({ comment: 'Cold and clean' })).toEqual(['stars']);
  });

  it('trims the comment', () => {
    expect(rateBookingBodySchema.parse({ stars: 4, comment: '  Cold and clean \n' })).toEqual({
      stars: 4,
      comment: 'Cold and clean',
    });
  });

  it.each(['', '   ', '\n\t'])('stores the blank comment %j as null', (comment) => {
    expect(rateBookingBodySchema.parse({ stars: 4, comment })).toEqual({ stars: 4, comment: null });
  });

  it('caps the comment after trimming', () => {
    const longest = 'x'.repeat(RATING_COMMENT_MAX_LENGTH);
    expect(rateBookingBodySchema.parse({ stars: 5, comment: ` ${longest} ` }).comment).toBe(
      longest,
    );
    expect(issuePaths({ stars: 5, comment: `${longest}x` })).toEqual(['comment']);
  });

  it('refuses a null comment, which is left out instead', () => {
    expect(issuePaths({ stars: 5, comment: null })).toEqual(['comment']);
  });

  it('refuses unknown fields, such as whose rating it is', () => {
    expect(issuePaths({ stars: 5, provider_id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f' })).toEqual([
      '',
    ]);
  });
});

describe('bookingRatingSchema', () => {
  it('has the stars, comment and time only, never who rated or whom', () => {
    expect(Object.keys(bookingRatingSchema.shape)).toEqual(['stars', 'comment', 'created_at']);
  });
});

describe('canRateBooking', () => {
  const rating = { stars: 4, comment: null, created_at: '2026-12-31T10:00:00.000Z' };

  it.each(bookingStatuses)('allows a %s booking only if it is completed', (status) => {
    expect(canRateBooking({ status, rating: null })).toBe(status === 'completed');
  });

  it('refuses a booking already rated', () => {
    expect(canRateBooking({ status: 'completed', rating })).toBe(false);
  });
});

describe('bookingRatingPath', () => {
  it('fills the web route with the booking id', () => {
    expect(BOOKING_RATING_ROUTE).toBe('/bookings/:bookingId/rate');
    expect(bookingRatingPath('6b1f0c2e-8d4a-4e7b-9c3f-2a5d8e1b7f40')).toBe(
      '/bookings/6b1f0c2e-8d4a-4e7b-9c3f-2a5d8e1b7f40/rate',
    );
  });

  it('keeps the id one path segment', () => {
    expect(bookingRatingPath('a/b?c')).toBe('/bookings/a%2Fb%3Fc/rate');
  });
});
