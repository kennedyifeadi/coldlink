import { describe, expect, it } from 'vitest';
import {
  farmerCancellationRefundKobo,
  isFarmerCancellable,
  type FarmerCancellation,
} from './bookingCancellation.js';
import { canTransition } from './bookingStateMachine.js';
import { bookingStatuses } from './enums.js';

// Starts at 00:00 WAT on 1 December 2026, which is 23:00 UTC on 30 November.
const confirmed: FarmerCancellation = {
  status: 'confirmed',
  start_date: '2026-12-01',
  deposit_kobo: 4_064_400,
  total_charged_online_kobo: 4_114_400,
};

const at = (iso: string) => new Date(iso);

describe('farmerCancellationRefundKobo', () => {
  it('refunds everything paid online before the provider accepts', () => {
    const pending = { ...confirmed, status: 'pending_provider' } as const;
    expect(farmerCancellationRefundKobo(pending, at('2026-11-30T22:59:00Z'), 24)).toBe(4_114_400);
  });

  it('refunds everything before acceptance even after the start has passed', () => {
    const pending = { ...confirmed, status: 'pending_provider' } as const;
    expect(farmerCancellationRefundKobo(pending, at('2026-12-02T00:00:00Z'), 24)).toBe(4_114_400);
  });

  it('refunds the deposit but not the service fee well before the start', () => {
    expect(farmerCancellationRefundKobo(confirmed, at('2026-11-20T09:00:00Z'), 24)).toBe(4_064_400);
  });

  it('refunds the deposit exactly free-cancel hours before 00:00 in Lagos', () => {
    expect(farmerCancellationRefundKobo(confirmed, at('2026-11-29T23:00:00Z'), 24)).toBe(4_064_400);
  });

  it('refunds nothing a millisecond after that', () => {
    expect(farmerCancellationRefundKobo(confirmed, at('2026-11-29T23:00:00.001Z'), 24)).toBe(0);
  });

  it('measures from Lagos midnight, not UTC midnight', () => {
    // 24 hours before 00:00 UTC on 1 December, but only 23 before the start in Lagos.
    expect(farmerCancellationRefundKobo(confirmed, at('2026-11-30T00:00:00Z'), 24)).toBe(0);
  });

  it('refunds nothing once the start has passed', () => {
    expect(farmerCancellationRefundKobo(confirmed, at('2026-12-01T10:00:00Z'), 24)).toBe(0);
  });

  it('follows the configured window', () => {
    expect(farmerCancellationRefundKobo(confirmed, at('2026-11-28T23:00:00Z'), 48)).toBe(4_064_400);
    expect(farmerCancellationRefundKobo(confirmed, at('2026-11-29T23:00:00Z'), 48)).toBe(0);
  });

  it('allows a free cancellation up to the start when the window is 0 hours', () => {
    expect(farmerCancellationRefundKobo(confirmed, at('2026-11-30T23:00:00Z'), 0)).toBe(4_064_400);
    expect(farmerCancellationRefundKobo(confirmed, at('2026-11-30T23:00:00.001Z'), 0)).toBe(0);
  });
});

describe('isFarmerCancellable', () => {
  it.each(bookingStatuses)('agrees with the state machine for %s', (status) => {
    expect(isFarmerCancellable(status)).toBe(canTransition(status, 'cancelled', 'farmer'));
  });
});
