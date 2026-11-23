import { describe, expect, it } from 'vitest';
import { bookingStatuses } from './enums.js';
import {
  PROVIDER_BOOKINGS_DEFAULT_LIMIT,
  providerBookingDetailSchema,
  providerBookingGroupOf,
  providerBookingGroupStatuses,
  providerBookingGroups,
  providerBookingsQuerySchema,
  providerDashboardSchema,
} from './providerDashboard.js';

const booking = {
  id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  code: 'CL-7K3Q9',
  status: 'pending_provider',
  provider: { id: '6d1f0c2a-8e3b-4f5a-9c7d-1b2e3f4a5b6c', display_name: 'Bodija Cold Room' },
  crop: { id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', name: 'Tomatoes' },
  quantity: 10,
  capacity_unit: 'crates',
  start_date: '2026-12-01',
  duration_days: 30,
  end_date: '2026-12-31',
  balance_due_kobo: 9_483_600,
  payout_kobo: 3_048_300,
  provider_response_due_at: '2026-11-10T14:45:00.000Z',
  checked_in_at: null,
  collected_at: null,
};

function issuePaths(query: unknown): string[] {
  const result = providerBookingsQuerySchema.safeParse(query);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('providerBookingGroupStatuses', () => {
  it('puts every status but payment_pending in exactly one group', () => {
    const grouped = providerBookingGroups.flatMap((group) => providerBookingGroupStatuses[group]);
    expect([...grouped].sort()).toEqual(
      bookingStatuses.filter((status) => status !== 'payment_pending').sort(),
    );
  });

  it('finds the group of a status, and none for an unpaid hold', () => {
    expect(providerBookingGroupOf('pending_provider')).toBe('requests');
    expect(providerBookingGroupOf('confirmed')).toBe('upcoming');
    expect(providerBookingGroupOf('in_storage')).toBe('in_storage');
    expect(providerBookingGroupOf('no_show')).toBe('past');
    expect(providerBookingGroupOf('payment_pending')).toBeUndefined();
  });
});

describe('providerBookingsQuerySchema', () => {
  it('reads the limit from the query string and defaults it', () => {
    expect(providerBookingsQuerySchema.parse({ group: 'past', limit: '5' })).toEqual({
      group: 'past',
      limit: 5,
    });
    expect(providerBookingsQuerySchema.parse({ group: 'requests' })).toEqual({
      group: 'requests',
      limit: PROVIDER_BOOKINGS_DEFAULT_LIMIT,
    });
  });

  it('needs a known group', () => {
    expect(issuePaths({})).toEqual(['group']);
    expect(issuePaths({ group: 'payment_pending' })).toEqual(['group']);
  });

  it.each(['0', '51', '2.5', 'ten'])('rejects the limit %j', (limit) => {
    expect(issuePaths({ group: 'past', limit })).toEqual(['limit']);
  });

  it('takes a booking id as the cursor, and nothing else', () => {
    expect(issuePaths({ group: 'past', cursor: booking.id })).toEqual([]);
    expect(issuePaths({ group: 'past', cursor: 'page-2' })).toEqual(['cursor']);
  });

  it('rejects unknown parameters', () => {
    expect(issuePaths({ group: 'past', status: 'completed' })).toEqual(['']);
  });
});

describe('providerBookingDetailSchema', () => {
  it('is the provider booking with its status history', () => {
    const history = [{ status: 'payment_pending', at: '2026-11-10T12:00:00.000Z' }];
    expect(providerBookingDetailSchema.parse({ ...booking, status_history: history })).toEqual({
      ...booking,
      status_history: history,
    });
  });

  it.each(['farmer_phone', 'farmer_name', 'farmer_id'])('refuses a %s field', (field) => {
    const detail = { ...booking, status_history: [], [field]: 'x' };
    expect(providerBookingDetailSchema.safeParse(detail).success).toBe(false);
  });
});

describe('providerDashboardSchema', () => {
  const list = { count: 1, items: [booking] };
  const dashboard = {
    provider: booking.provider,
    occupancy: { date: '2026-11-23', used: 12.5, total: 50, capacity_unit: 'sqm' },
    requests: list,
    upcoming: { count: 0, items: [] },
    in_storage: { count: 0, items: [] },
    earnings: { owed_kobo: 3_048_300, paid_kobo: 0 },
  };

  it('accepts a dashboard', () => {
    expect(providerDashboardSchema.parse(dashboard)).toEqual(dashboard);
  });

  it('holds each list to five bookings', () => {
    const six = { count: 6, items: Array.from({ length: 6 }, () => booking) };
    expect(providerDashboardSchema.safeParse({ ...dashboard, requests: six }).success).toBe(false);
  });

  it('refuses earnings in part kobo', () => {
    const earnings = { owed_kobo: 0.5, paid_kobo: 0 };
    expect(providerDashboardSchema.safeParse({ ...dashboard, earnings }).success).toBe(false);
  });
});
