import { describe, expect, it } from 'vitest';
import {
  BOOKING_CODE_ALPHABET,
  BOOKING_CODE_LENGTH,
  bookingCodeSchema,
  cancelBookingBodySchema,
  createBookingBodySchema,
  farmerBookingSchema,
} from './bookings.js';

const valid = {
  provider_id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  crop_id: '6d1f0c2a-8e3b-4f5a-9c7d-1b2e3f4a5b6c',
  quantity: 20,
  capacity_unit: 'crates',
  days: 14,
};

function issuePaths(body: unknown): string[] {
  const result = createBookingBodySchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('createBookingBodySchema', () => {
  it('accepts the quote terms with a crop', () => {
    expect(createBookingBodySchema.parse(valid)).toEqual(valid);
  });

  it('needs a crop', () => {
    const { crop_id: _crop, ...withoutCrop } = valid;
    expect(issuePaths(withoutCrop)).toEqual(['crop_id']);
  });

  it('rejects a crop id that is not a uuid', () => {
    expect(issuePaths({ ...valid, crop_id: 'tomatoes' })).toEqual(['crop_id']);
  });

  it('keeps the quote rule against part of a crate', () => {
    expect(issuePaths({ ...valid, quantity: 2.5 })).toEqual(['quantity']);
  });

  it('rejects unknown fields, such as a price', () => {
    expect(issuePaths({ ...valid, unit_price_kobo: 1 })).toEqual(['']);
  });
});

describe('cancelBookingBodySchema', () => {
  it('allows no reason', () => {
    expect(cancelBookingBodySchema.parse({})).toEqual({});
  });

  it('trims the reason', () => {
    expect(cancelBookingBodySchema.parse({ reason: '  Harvest came early ' })).toEqual({
      reason: 'Harvest came early',
    });
  });

  it.each(['', '   ', 'x'.repeat(501)])('rejects the reason %j', (reason) => {
    expect(cancelBookingBodySchema.safeParse({ reason }).success).toBe(false);
  });
});

describe('bookingCodeSchema', () => {
  it('matches the database check', () => {
    expect(bookingCodeSchema.safeParse('CL-7K3Q9').success).toBe(true);
    for (const code of ['CL-7K3Q', 'CL-7K3Q90', 'CL-7K3O9', 'CL-7K3I9', 'CL-0K3Q9', 'cl-7K3Q9']) {
      expect(bookingCodeSchema.safeParse(code).success).toBe(false);
    }
  });

  it('accepts every character of the alphabet and nothing else', () => {
    expect(BOOKING_CODE_ALPHABET).toHaveLength(32);
    for (const character of BOOKING_CODE_ALPHABET) {
      const code = `CL-${character.repeat(BOOKING_CODE_LENGTH)}`;
      expect(bookingCodeSchema.safeParse(code).success).toBe(true);
    }
    for (const character of '01OI') {
      expect(bookingCodeSchema.safeParse(`CL-${character.repeat(5)}`).success).toBe(false);
    }
  });
});

describe('farmerBookingSchema', () => {
  it('has no commission or payout field', () => {
    const keys = Object.keys(farmerBookingSchema.shape);
    expect(keys.filter((key) => /commission|payout/.test(key))).toEqual([]);
  });
});
