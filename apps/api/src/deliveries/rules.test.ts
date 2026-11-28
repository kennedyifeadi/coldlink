import { startOfDayInLagos } from '@coldlink/shared';
import { describe, expect, it } from 'vitest';
import { isStillPayable } from './rules.js';

describe('isStillPayable', () => {
  const booking = {
    status: 'confirmed',
    start_date: '2026-12-01',
    end_date: '2026-12-31',
  } as const;
  const day = (date: string) => startOfDayInLagos(date);
  const at = (iso: string) => new Date(iso);

  it('is payable while the booking takes it and its day is in the window', () => {
    expect(isStillPayable('inbound', day('2026-11-28'), booking, at('2026-11-26T10:00:00Z'))).toBe(
      true,
    );
  });

  it('is not once its day has passed in Lagos', () => {
    // 00:30 on 29 November in Lagos.
    expect(isStillPayable('inbound', day('2026-11-28'), booking, at('2026-11-28T23:30:00Z'))).toBe(
      false,
    );
  });

  it('is not once the booking no longer takes it', () => {
    const cancelled = { ...booking, status: 'cancelled' } as const;
    expect(
      isStillPayable('inbound', day('2026-11-28'), cancelled, at('2026-11-26T10:00:00Z')),
    ).toBe(false);
    const stored = { ...booking, status: 'in_storage' } as const;
    expect(isStillPayable('inbound', day('2026-11-28'), stored, at('2026-11-26T10:00:00Z'))).toBe(
      false,
    );
    expect(isStillPayable('outbound', day('2026-12-20'), stored, at('2026-12-10T10:00:00Z'))).toBe(
      true,
    );
  });

  it('is not without a scheduled day', () => {
    expect(isStillPayable('inbound', null, booking, at('2026-11-26T10:00:00Z'))).toBe(false);
  });
});
