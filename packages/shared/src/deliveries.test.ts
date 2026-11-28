import { describe, expect, it } from 'vitest';
import { deliveryRefusal, isLiveDelivery, type BookingDelivery } from './deliveries.js';
import { deliveryStatuses } from './enums.js';

const delivery = (changes: Partial<BookingDelivery> = {}): BookingDelivery => ({
  id: '5e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b',
  direction: 'inbound',
  status: 'requested',
  paid: true,
  scheduled_for: '2026-11-18',
  fee_kobo: 245_000,
  ...changes,
});

// 09:00 in Lagos on 10 November 2026.
const NOW = new Date('2026-11-10T08:00:00Z');
const booking = {
  status: 'confirmed' as const,
  start_date: '2026-11-20',
  end_date: '2026-11-27',
  deliveries: [] as BookingDelivery[],
};

describe('isLiveDelivery', () => {
  it('is live once paid, until it is cancelled or fails', () => {
    expect(
      deliveryStatuses.filter((status) => isLiveDelivery(delivery({ status, paid: true }))),
    ).toEqual(['requested', 'assigned', 'accepted', 'picked_up', 'delivered']);
  });

  it('is never live unpaid', () => {
    expect(isLiveDelivery(delivery({ paid: false }))).toBe(false);
  });
});

describe('deliveryRefusal', () => {
  it('allows either direction for a confirmed booking with none', () => {
    expect(deliveryRefusal('inbound', booking, NOW)).toBeUndefined();
    expect(deliveryRefusal('outbound', booking, NOW)).toBeUndefined();
  });

  it('refuses a second live delivery that way, but not the other way', () => {
    const withInbound = { ...booking, deliveries: [delivery()] };
    expect(deliveryRefusal('inbound', withInbound, NOW)).toBe('already_live');
    expect(deliveryRefusal('outbound', withInbound, NOW)).toBeUndefined();
  });

  it('allows asking again over an unpaid or cancelled one', () => {
    const ended = {
      ...booking,
      deliveries: [delivery({ paid: false }), delivery({ status: 'cancelled' })],
    };
    expect(deliveryRefusal('inbound', ended, NOW)).toBeUndefined();
  });

  it('refuses a status that does not take that delivery', () => {
    const stored = { ...booking, status: 'in_storage' as const };
    expect(deliveryRefusal('inbound', stored, NOW)).toBe('not_accepted');
    expect(deliveryRefusal('outbound', stored, NOW)).toBeUndefined();
    const waiting = { ...booking, status: 'pending_provider' as const };
    expect(deliveryRefusal('outbound', waiting, NOW)).toBe('not_accepted');
  });

  it('refuses once the window has closed', () => {
    // 00:30 on 21 November in Lagos, the day after the start date.
    const later = new Date('2026-11-20T23:30:00Z');
    expect(deliveryRefusal('inbound', booking, later)).toBe('window_closed');
    expect(deliveryRefusal('outbound', booking, later)).toBeUndefined();
  });
});
