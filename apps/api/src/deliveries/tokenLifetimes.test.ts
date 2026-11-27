import { startOfDayInLagos } from '@coldlink/shared';
import { describe, expect, it } from 'vitest';
import { deliveryTokenExpiresAt } from './tokenLifetimes.js';

// Stored as 00:00 in Lagos on 18 November 2026, which is 23:00 UTC on the 17th.
const SCHEDULED = startOfDayInLagos('2026-11-18');

describe('deliveryTokenExpiresAt', () => {
  it('lasts an accept link to the end of the scheduled day in Lagos', () => {
    const issued = new Date('2026-11-10T08:00:00Z');
    expect(deliveryTokenExpiresAt('delivery_accept', SCHEDULED, issued)).toEqual(
      new Date('2026-11-18T23:00:00Z'),
    );
  });

  it('lasts an update link to the end of the day after the scheduled day', () => {
    const issued = new Date('2026-11-10T08:00:00Z');
    expect(deliveryTokenExpiresAt('delivery_update', SCHEDULED, issued)).toEqual(
      new Date('2026-11-19T23:00:00Z'),
    );
  });

  it('reads the day in Lagos, not UTC, for a scheduled day stored the evening before in UTC', () => {
    expect(SCHEDULED.toISOString()).toBe('2026-11-17T23:00:00.000Z');
    const issued = new Date('2026-11-17T00:00:00Z');
    expect(deliveryTokenExpiresAt('delivery_accept', SCHEDULED, issued).toISOString()).toBe(
      '2026-11-18T23:00:00.000Z',
    );
  });

  it('gives at least 12 hours when assigned late on the scheduled day', () => {
    // 22:30 in Lagos on the day itself: the day ends in 30 minutes.
    const issued = new Date('2026-11-18T21:30:00Z');
    expect(deliveryTokenExpiresAt('delivery_accept', SCHEDULED, issued)).toEqual(
      new Date('2026-11-19T09:30:00Z'),
    );
  });

  it('gives at least 12 hours when assigned after the scheduled day has passed', () => {
    const issued = new Date('2026-11-21T10:00:00Z');
    expect(deliveryTokenExpiresAt('delivery_update', SCHEDULED, issued)).toEqual(
      new Date('2026-11-21T22:00:00Z'),
    );
  });

  it('takes the end of the day exactly 12 hours away as it is', () => {
    // 11:00 in Lagos, 12 hours before midnight.
    const issued = new Date('2026-11-18T10:00:00Z');
    expect(deliveryTokenExpiresAt('delivery_accept', SCHEDULED, issued)).toEqual(
      new Date('2026-11-18T23:00:00Z'),
    );
  });

  it('lasts 12 hours with no scheduled day', () => {
    const issued = new Date('2026-11-10T08:00:00Z');
    for (const purpose of ['delivery_accept', 'delivery_update'] as const) {
      expect(deliveryTokenExpiresAt(purpose, null, issued)).toEqual(
        new Date('2026-11-10T20:00:00Z'),
      );
    }
  });
});
