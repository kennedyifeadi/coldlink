import { describe, expect, it } from 'vitest';
import { formatNaira, formatNumber } from './format';

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
