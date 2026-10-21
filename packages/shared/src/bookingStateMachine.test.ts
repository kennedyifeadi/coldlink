import { describe, expect, it } from 'vitest';
import { canTransition } from './bookingStateMachine.js';
import { bookingStatuses, type BookingStatus } from './enums.js';

const allowed: [BookingStatus, BookingStatus][] = [
  ['payment_pending', 'pending_provider'],
  ['payment_pending', 'expired'],
  ['pending_provider', 'confirmed'],
  ['pending_provider', 'rejected'],
  ['pending_provider', 'expired'],
  ['confirmed', 'in_storage'],
  ['confirmed', 'cancelled'],
  ['confirmed', 'no_show'],
  ['in_storage', 'completed'],
];

describe('canTransition', () => {
  it.each(allowed)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each<[BookingStatus, BookingStatus]>([
    ['payment_pending', 'confirmed'],
    ['payment_pending', 'cancelled'],
    ['pending_provider', 'payment_pending'],
    ['pending_provider', 'cancelled'],
    ['confirmed', 'completed'],
    ['confirmed', 'confirmed'],
    ['in_storage', 'cancelled'],
    ['rejected', 'confirmed'],
    ['expired', 'pending_provider'],
    ['cancelled', 'confirmed'],
    ['no_show', 'in_storage'],
    ['completed', 'in_storage'],
  ])('refuses %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('allows nothing outside the PRD 6.5 transitions', () => {
    for (const from of bookingStatuses) {
      for (const to of bookingStatuses) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });
});
