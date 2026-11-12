import { describe, expect, it } from 'vitest';
import { bookingQuoteBodySchema } from '@coldlink/shared';
import {
  bookingStepPath,
  facilityPath,
  paymentReturnPath,
  quoteBodyFor,
  readBookingIntent,
  readBookingRoute,
  type BookingIntent,
} from './bookingIntent';

const providerId = '9d4c6f5b-1e7a-4b82-8d3e-4f5a6b7c8d9e';
const intent: BookingIntent = {
  crop_id: '6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b',
  quantity: 12.5,
  capacity_unit: 'kg',
  days: 7,
  start_date: '2026-11-10',
};

const queryOf = (path: string) => new URL(path, 'http://localhost').searchParams;

describe('facilityPath', () => {
  it('puts the provider in the path and the terms in the query, with no location', () => {
    const path = facilityPath(providerId, intent);

    expect(new URL(path, 'http://localhost').pathname).toBe(`/details/${providerId}`);
    expect(path).not.toMatch(/lat|lng/);
  });

  it('round-trips through readBookingIntent', () => {
    expect(readBookingIntent(queryOf(facilityPath(providerId, intent)))).toEqual(intent);
  });
});

describe('readBookingIntent', () => {
  it.each([
    ['nothing', ''],
    [
      'a missing unit',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=1&days=1&start=2026-11-10',
    ],
    [
      'an unknown unit',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=1&unit=bags&days=1&start=2026-11-10',
    ],
    [
      'an empty quantity',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=&unit=kg&days=1&start=2026-11-10',
    ],
    [
      'a fraction of a day',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=1&unit=kg&days=1.5&start=2026-11-10',
    ],
    ['a crop that is not an id', 'crop=tomatoes&quantity=1&unit=kg&days=1&start=2026-11-10'],
    [
      'no quantity',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=0&unit=kg&days=1&start=2026-11-10',
    ],
    [
      'a negative quantity',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=-3&unit=kg&days=1&start=2026-11-10',
    ],
    [
      'a quantity in words',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=ten&unit=kg&days=1&start=2026-11-10',
    ],
    [
      'more than a year',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=1&unit=kg&days=366&start=2026-11-10',
    ],
    [
      'no days',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=1&unit=kg&days=0&start=2026-11-10',
    ],
    [
      'a date that does not exist',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=1&unit=kg&days=1&start=2026-02-30',
    ],
    ['no start date', 'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=1&unit=kg&days=1'],
    [
      'a bad date',
      'crop=6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b&quantity=1&unit=kg&days=1&start=tomorrow',
    ],
  ])('gives nothing for %s', (_name, query) => {
    expect(readBookingIntent(new URLSearchParams(query))).toBeUndefined();
  });
});

describe('readBookingRoute', () => {
  const query = queryOf(facilityPath(providerId, intent));

  it('reads the provider and the terms', () => {
    expect(readBookingRoute(providerId, query)).toEqual({ providerId, intent });
  });

  it.each([
    ['no provider', undefined],
    ['a provider that is not an id', 'dugbe'],
  ])('gives nothing for %s', (_name, id) => {
    expect(readBookingRoute(id, query)).toBeUndefined();
  });

  it('gives nothing for edited terms', () => {
    expect(readBookingRoute(providerId, new URLSearchParams('crop=x'))).toBeUndefined();
  });
});

describe('paymentReturnPath', () => {
  it('leads from payment back to the review of the same booking', () => {
    const payment = new URL(bookingStepPath('payment', providerId, intent), 'http://localhost');

    expect(paymentReturnPath(payment)).toBe(bookingStepPath('review', providerId, intent));
  });
});

describe('quoteBodyFor', () => {
  it('gives a body the quote accepts, without the crop', () => {
    const body = quoteBodyFor({
      providerId,
      intent: { ...intent, capacity_unit: 'crates', quantity: 3 },
    });

    expect(bookingQuoteBodySchema.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty('crop_id');
  });
});
