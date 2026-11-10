import { describe, expect, it } from 'vitest';
import { addDays, todayInLagos } from './dates.js';

describe('todayInLagos', () => {
  it('is already the next day in Lagos from 23:00 UTC', () => {
    expect(todayInLagos(new Date('2026-11-10T22:59:59Z'))).toBe('2026-11-10');
    expect(todayInLagos(new Date('2026-11-10T23:00:00Z'))).toBe('2026-11-11');
  });

  it('crosses a year boundary', () => {
    expect(todayInLagos(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});

describe('addDays', () => {
  it.each([
    ['2026-11-10', 1, '2026-11-11'],
    ['2026-11-25', 14, '2026-12-09'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-11-10', 365, '2027-11-10'],
  ])('%s plus %i days is %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
