import {
  bookingStatuses,
  farmerBookingSchema,
  isFarmerCancellable,
  providerBookingRequestSchema,
} from '@coldlink/shared';
import { describe, expect, it } from 'vitest';
import type { ProviderBookingRow } from './providerStore.js';
import type { FarmerBookingRow } from './store.js';
import { farmerCancellationPreview, toFarmerBooking, toProviderBookingRequest } from './views.js';

// Starts at 00:00 in Lagos on 12 November 2026, which is 23:00 UTC on 11 November.
const row: FarmerBookingRow = {
  id: '3c9e2a1b-7d4f-4e8a-b5c6-0d1e2f3a4b5c',
  code: 'CL-7K3Q9',
  status: 'confirmed',
  provider_id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  crop_id: '6d1f0c2a-8e3b-4f5a-9c7d-1b2e3f4a5b6c',
  quantity: 10,
  capacity_unit: 'crates',
  start_date: '2026-11-12',
  duration_days: 10,
  end_date: '2026-11-22',
  unit_price_kobo: 50_000,
  storage_subtotal_kobo: 5_000_000,
  service_fee_kobo: 20_000,
  deposit_kobo: 1_500_000,
  balance_due_kobo: 3_500_000,
  delivery_fee_kobo: 0,
  total_charged_online_kobo: 1_520_000,
  payment_expires_at: new Date('2026-11-10T08:30:00Z'),
  provider_response_due_at: new Date('2026-11-10T10:05:00Z'),
  checked_in_at: null,
  collected_at: null,
  cancelled_by: null,
  cancel_reason: null,
  created_at: new Date('2026-11-10T08:00:00Z'),
  provider_display_name: 'Bodija Cold Room',
  provider_lga: 'Ibadan North',
  provider_address_text: '12 Bodija Market Road',
  provider_landmark: null,
  provider_phone: '+2348006000001',
  crop_name: 'Tomatoes',
};

const terms = { now: new Date('2026-11-10T08:00:00Z'), freeCancelHours: 24 };

describe('farmerCancellationPreview', () => {
  it('refunds everything before acceptance, with no deposit deadline', () => {
    expect(farmerCancellationPreview({ ...row, status: 'pending_provider' }, 0, terms)).toEqual({
      allowed: true,
      refund_kobo: 1_520_000,
      deposit_refund_ends_at: null,
    });
  });

  it('refunds the deposit of a confirmed booking until the free window ends', () => {
    expect(farmerCancellationPreview(row, 0, terms)).toEqual({
      allowed: true,
      refund_kobo: 1_500_000,
      deposit_refund_ends_at: '2026-11-10T23:00:00.000Z',
    });
  });

  it('refunds nothing once the free window has ended, and says when it did', () => {
    const late = { ...terms, now: new Date('2026-11-10T23:00:00.001Z') };
    expect(farmerCancellationPreview(row, 0, late)).toEqual({
      allowed: true,
      refund_kobo: 0,
      deposit_refund_ends_at: '2026-11-10T23:00:00.000Z',
    });
  });

  it("adds the fees of the paid deliveries it would cancel, leaving them out of the booking's part", () => {
    const withDelivery = {
      ...row,
      delivery_fee_kobo: 223_000,
      total_charged_online_kobo: 1_743_000,
    };
    expect(
      farmerCancellationPreview({ ...withDelivery, status: 'pending_provider' }, 223_000, terms),
    ).toMatchObject({ refund_kobo: 1_743_000 });
    expect(farmerCancellationPreview(withDelivery, 223_000, terms)).toMatchObject({
      refund_kobo: 1_723_000,
    });
    const late = { ...terms, now: new Date('2026-11-10T23:00:00.001Z') };
    expect(farmerCancellationPreview(withDelivery, 223_000, late)).toMatchObject({
      refund_kobo: 223_000,
    });
  });

  it.each(bookingStatuses.filter((status) => !isFarmerCancellable(status)))(
    'does not allow cancelling a booking that is %s',
    (status) => {
      expect(farmerCancellationPreview({ ...row, status }, 0, terms)).toEqual({ allowed: false });
    },
  );
});

describe('toFarmerBooking', () => {
  const history = [
    { to_status: 'payment_pending', created_at: new Date('2026-11-10T08:00:00Z') },
    { to_status: 'pending_provider', created_at: new Date('2026-11-10T08:05:00Z') },
    { to_status: 'confirmed', created_at: new Date('2026-11-10T09:00:00Z') },
  ];

  it('gives each status change as a status and a time only', () => {
    const booking = farmerBookingSchema.parse(
      toFarmerBooking({ booking: row, history, rating: undefined, deliveryRefundKobo: 0 }, terms),
    );
    expect(booking.status_history).toEqual([
      { status: 'payment_pending', at: '2026-11-10T08:00:00.000Z' },
      { status: 'pending_provider', at: '2026-11-10T08:05:00.000Z' },
      { status: 'confirmed', at: '2026-11-10T09:00:00.000Z' },
    ]);
  });

  it('passes on the facility phone the query read, or null', () => {
    const shown = toFarmerBooking(
      { booking: row, history, rating: undefined, deliveryRefundKobo: 0 },
      terms,
    );
    const hidden = toFarmerBooking(
      {
        booking: { ...row, provider_phone: null },
        history,
        rating: undefined,
        deliveryRefundKobo: 0,
      },
      terms,
    );
    expect(shown.provider.phone).toBe('+2348006000001');
    expect(hidden.provider.phone).toBeNull();
  });

  it('has a null rating until the farmer rates it', () => {
    const booking = toFarmerBooking(
      { booking: row, history, rating: undefined, deliveryRefundKobo: 0 },
      terms,
    );
    expect(booking.rating).toBeNull();
  });

  it("gives the farmer's rating as its stars, comment and time", () => {
    const rating = { stars: 4, comment: null, created_at: new Date('2026-11-23T10:00:00Z') };
    const booking = farmerBookingSchema.parse(
      toFarmerBooking(
        { booking: { ...row, status: 'completed' }, history, rating, deliveryRefundKobo: 0 },
        terms,
      ),
    );
    expect(booking.rating).toEqual({
      stars: 4,
      comment: null,
      created_at: '2026-11-23T10:00:00.000Z',
    });
  });
});

describe('toProviderBookingRequest', () => {
  const providerRow: ProviderBookingRow = {
    id: row.id,
    code: row.code,
    status: 'pending_provider',
    provider_id: row.provider_id,
    crop_id: row.crop_id,
    quantity: row.quantity,
    capacity_unit: row.capacity_unit,
    start_date: row.start_date,
    duration_days: row.duration_days,
    end_date: row.end_date,
    balance_due_kobo: row.balance_due_kobo,
    deposit_kobo: row.deposit_kobo,
    commission_kobo: 150_000,
    provider_response_due_at: row.provider_response_due_at,
    checked_in_at: null,
    collected_at: null,
    provider_display_name: row.provider_display_name,
    crop_name: row.crop_name,
  };

  it('gives the code, the deadline and the payout the provider decides on', () => {
    expect(providerBookingRequestSchema.parse(toProviderBookingRequest(providerRow))).toEqual({
      code: 'CL-7K3Q9',
      facility_name: 'Bodija Cold Room',
      crop_name: 'Tomatoes',
      quantity: 10,
      capacity_unit: 'crates',
      start_date: '2026-11-12',
      duration_days: 10,
      end_date: '2026-11-22',
      payout_kobo: 1_350_000,
      response_due_at: '2026-11-10T10:05:00.000Z',
    });
  });

  it('gives a null deadline when the booking has none', () => {
    const view = toProviderBookingRequest({ ...providerRow, provider_response_due_at: null });
    expect(view.response_due_at).toBeNull();
  });
});
