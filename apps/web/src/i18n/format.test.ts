import { describe, expect, it } from 'vitest';
import { formatDate, formatKobo, formatNaira, formatNumber } from './format';

describe('formatNaira', () => {
  it('prefixes the naira sign and groups thousands with commas', () => {
    expect(formatNaira(1500)).toBe('₦1,500');
    expect(formatNaira(5400)).toBe('₦5,400');
  });

  it('formats zero', () => {
    expect(formatNaira(0)).toBe('₦0');
  });

  it('formats large values', () => {
    expect(formatNaira(1234567890)).toBe('₦1,234,567,890');
  });

  it('leaves amounts under a thousand ungrouped', () => {
    expect(formatNaira(800)).toBe('₦800');
  });
});

describe('formatNumber', () => {
  it('groups thousands with commas', () => {
    expect(formatNumber(1500)).toBe('1,500');
    expect(formatNumber(1234567890)).toBe('1,234,567,890');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('keeps decimals with a point', () => {
    expect(formatNumber(2.4)).toBe('2.4');
    expect(formatNumber(1234567.5)).toBe('1,234,567.5');
  });
});

describe('formatKobo', () => {
  it('shows whole naira without decimals', () => {
    expect(formatKobo(3_500_000)).toBe('₦35,000');
    expect(formatKobo(0)).toBe('₦0');
  });

  it('keeps the kobo of an amount that has them, never rounding', () => {
    expect(formatKobo(1_234_567)).toBe('₦12,345.67');
    expect(formatKobo(1_050_001)).toBe('₦10,500.01');
    expect(formatKobo(50)).toBe('₦0.50');
  });
});

describe('formatDate', () => {
  it('shows the calendar day it was given, whatever the time zone', () => {
    expect(formatDate('2026-11-10')).toBe('Tue, 10 Nov 2026');
    expect(formatDate('2026-12-31')).toBe('Thu, 31 Dec 2026');
  });
});
