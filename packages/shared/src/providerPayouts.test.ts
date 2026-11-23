import { describe, expect, it } from 'vitest';
import {
  PROVIDER_PAYOUTS_DEFAULT_LIMIT,
  providerPayoutSchema,
  providerPayoutsQuerySchema,
  providerPayoutsResponseSchema,
} from './providerPayouts.js';

const owed = {
  id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  amount_kobo: 3_048_300,
  status: 'owed',
  created_at: '2026-12-01T09:30:00.000Z',
  paid_at: null,
  reference: null,
  booking: {
    id: '6d1f0c2a-8e3b-4f5a-9c7d-1b2e3f4a5b6c',
    code: 'CL-7K3Q9',
    crop: { id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', name: 'Tomatoes' },
    start_date: '2026-12-01',
    duration_days: 30,
    end_date: '2026-12-31',
  },
};

const paid = {
  ...owed,
  status: 'paid',
  paid_at: '2026-12-03T10:00:00.000Z',
  reference: 'TRF-0042',
};

describe('providerPayoutsQuerySchema', () => {
  it('reads the limit from the query string and defaults it', () => {
    expect(providerPayoutsQuerySchema.parse({ status: 'paid', limit: '5' })).toEqual({
      status: 'paid',
      limit: 5,
    });
    expect(providerPayoutsQuerySchema.parse({})).toEqual({
      limit: PROVIDER_PAYOUTS_DEFAULT_LIMIT,
    });
  });

  it('refuses another status, a limit outside 1 to 50, a cursor that is not an id and any other key', () => {
    for (const query of [
      { status: 'pending' },
      { limit: '0' },
      { limit: '51' },
      { cursor: 'CL-7K3Q9' },
      { recorded_by: 'someone' },
    ]) {
      expect(providerPayoutsQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe('providerPayoutSchema', () => {
  it('takes an owed payout and a paid one', () => {
    expect(providerPayoutSchema.parse(owed)).toEqual(owed);
    expect(providerPayoutSchema.parse(paid)).toEqual(paid);
  });

  it('refuses a paid payout without its date or reference, and an owed one with them', () => {
    expect(providerPayoutSchema.safeParse({ ...paid, paid_at: null }).success).toBe(false);
    expect(providerPayoutSchema.safeParse({ ...paid, reference: null }).success).toBe(false);
    expect(providerPayoutSchema.safeParse({ ...owed, reference: 'TRF-0042' }).success).toBe(false);
  });

  it('has no field for who recorded it or for the farmer', () => {
    expect(providerPayoutSchema.safeParse({ ...paid, recorded_by: owed.id }).success).toBe(false);
    expect(
      providerPayoutSchema.safeParse({ ...owed, booking: { ...owed.booking, farmer_id: owed.id } })
        .success,
    ).toBe(false);
  });
});

describe('providerPayoutsResponseSchema', () => {
  it('carries a page, the next cursor and the totals', () => {
    const body = {
      data: [paid, owed],
      next_cursor: null,
      earnings: { owed_kobo: 3_048_300, paid_kobo: 3_048_300 },
    };
    expect(providerPayoutsResponseSchema.parse(body)).toEqual(body);
    expect(providerPayoutsResponseSchema.safeParse({ ...body, earnings: undefined }).success).toBe(
      false,
    );
  });
});
