import { describe, expect, it } from 'vitest';
import { bookingQuoteBodySchema } from './bookingQuote.js';
import { MAX_SEARCH_DAYS } from './search.js';

const valid = {
  provider_id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  quantity: 20,
  capacity_unit: 'crates',
  days: 14,
};

function issuePaths(body: unknown): string[] {
  const result = bookingQuoteBodySchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('bookingQuoteBodySchema', () => {
  it('leaves the start date to the server when none is sent', () => {
    expect(bookingQuoteBodySchema.parse(valid)).toEqual(valid);
  });

  it('accepts a calendar start date', () => {
    expect(bookingQuoteBodySchema.parse({ ...valid, start_date: '2026-12-01' }).start_date).toBe(
      '2026-12-01',
    );
  });

  it.each([
    ['provider_id', 'facility-1'],
    ['quantity', 0],
    ['days', 0],
    ['days', 1.5],
    ['days', MAX_SEARCH_DAYS + 1],
    ['start_date', '2026-02-30'],
    ['capacity_unit', 'bags'],
  ])('rejects %s of %s', (field, value) => {
    expect(issuePaths({ ...valid, [field]: value })).toEqual([field]);
  });

  it('refuses part of a crate', () => {
    expect(issuePaths({ ...valid, quantity: 2.5 })).toEqual(['quantity']);
  });

  it.each(['sqm', 'kg'])('allows a fractional quantity in %s', (capacity_unit) => {
    expect(issuePaths({ ...valid, capacity_unit, quantity: 2.5 })).toEqual([]);
  });

  it('rejects unknown fields', () => {
    expect(issuePaths({ ...valid, unit_price_kobo: 1 })).toEqual(['']);
  });
});
