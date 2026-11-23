import {
  providerBookingDetailSchema,
  providerBookingSchema,
  providerDashboardSchema,
  providerPayoutSchema,
  type ProviderBooking,
  type ProviderBookingDetail,
  type ProviderDashboard,
  type ProviderPayout,
} from '@coldlink/shared';
import { jsonResponse, sessionFixture } from './api';
import { PROVIDER_ID } from './providerFixtures';

export { PROVIDER_ID };
export const BOOKING_ID = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';

export const providerSignedIn = {
  'POST /auth/refresh': jsonResponse(200, sessionFixture({ roles: ['farmer', 'provider'] })),
};

const facility = { id: PROVIDER_ID, display_name: 'Bodija Cold Room' };

/** A booking for Bodija Cold Room, waiting for an answer by 15:45 in Lagos on 10 November. */
export const providerBooking = (overrides: Partial<ProviderBooking> = {}): ProviderBooking =>
  providerBookingSchema.parse({
    id: BOOKING_ID,
    code: 'CL-7K3Q9',
    status: 'pending_provider',
    provider: facility,
    crop: { id: '6d1f0c2a-8e3b-4f5a-9c7d-1b2e3f4a5b6c', name: 'Tomatoes' },
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
    ...overrides,
  });

export const bookingDetail = (overrides: Partial<ProviderBookingDetail> = {}) =>
  providerBookingDetailSchema.parse({
    ...providerBooking(),
    status_history: [
      { status: 'payment_pending', at: '2026-11-10T12:40:00.000Z' },
      { status: 'pending_provider', at: '2026-11-10T12:45:00.000Z' },
    ],
    ...overrides,
  });

const otherIds = [
  '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a',
];

export const dashboard = (overrides: Partial<ProviderDashboard> = {}): ProviderDashboard =>
  providerDashboardSchema.parse({
    provider: facility,
    occupancy: { date: '2026-11-10', used: 7.5, total: 50, capacity_unit: 'crates' },
    requests: { count: 6, items: [providerBooking()] },
    upcoming: {
      count: 1,
      items: [
        providerBooking({
          id: otherIds[0],
          code: 'CL-ABCDE',
          status: 'confirmed',
          crop: { id: otherIds[1]!, name: 'Peppers' },
          provider_response_due_at: null,
        }),
      ],
    },
    in_storage: { count: 0, items: [] },
    earnings: { owed_kobo: 4_048_350, paid_kobo: 500_000 },
    ...overrides,
  });

export const pastBooking = (index: number) =>
  providerBooking({
    id: otherIds[index]!,
    code: `CL-PAST${index + 2}`,
    status: 'completed',
    provider_response_due_at: null,
    collected_at: '2026-11-01T10:00:00.000Z',
  });

/** A payout owed for the fixture booking since its check-in on 1 December. */
export const providerPayout = (overrides: Partial<ProviderPayout> = {}): ProviderPayout =>
  providerPayoutSchema.parse({
    id: '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b',
    amount_kobo: 3_048_300,
    status: 'owed',
    created_at: '2026-12-01T09:30:00.000Z',
    paid_at: null,
    reference: null,
    booking: {
      id: BOOKING_ID,
      code: 'CL-7K3Q9',
      crop: { id: '6d1f0c2a-8e3b-4f5a-9c7d-1b2e3f4a5b6c', name: 'Tomatoes' },
      start_date: '2026-12-01',
      duration_days: 30,
      end_date: '2026-12-31',
    },
    ...overrides,
  });

export const dashboardRoute = `GET /providers/${PROVIDER_ID}/dashboard`;
export const payoutsRoute = `GET /providers/${PROVIDER_ID}/payouts`;
export const updateRoute = `PATCH /providers/${PROVIDER_ID}`;
export const bookingsRoute = `GET /providers/${PROVIDER_ID}/bookings`;
export const detailRoute = `GET /providers/${PROVIDER_ID}/bookings/${BOOKING_ID}`;
export const actionRoute = (action: string) => `POST /bookings/${BOOKING_ID}/${action}`;
