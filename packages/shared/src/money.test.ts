import { describe, expect, it } from 'vitest';
import { koboSchema, koboToNaira, nairaToKobo } from './money.js';

describe('nairaToKobo', () => {
  it('converts whole naira', () => {
    expect(nairaToKobo(2258)).toBe(225_800);
    expect(nairaToKobo(0)).toBe(0);
  });

  it('converts naira and kobo without float error', () => {
    expect(nairaToKobo(12.34)).toBe(1234);
    expect(nairaToKobo(1.1)).toBe(110);
    expect(nairaToKobo(0.29)).toBe(29);
  });

  it.each([1.005, 0.001, 12.345])('rejects %s naira, which is a fraction of a kobo', (naira) => {
    expect(() => nairaToKobo(naira)).toThrow(RangeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1e14])('rejects %s', (naira) => {
    expect(() => nairaToKobo(naira)).toThrow(RangeError);
  });
});

describe('koboToNaira', () => {
  it('converts kobo to naira', () => {
    expect(koboToNaira(225_800)).toBe(2258);
    expect(koboToNaira(1234)).toBe(12.34);
    expect(koboToNaira(1)).toBe(0.01);
    expect(koboToNaira(0)).toBe(0);
  });

  it.each([1.5, Number.NaN, 2 ** 53])('rejects %s, which is not a safe whole number', (kobo) => {
    expect(() => koboToNaira(kobo)).toThrow(RangeError);
  });

  it('round-trips through nairaToKobo', () => {
    const mismatches: number[] = [];
    for (let kobo = 0; kobo <= 100_000; kobo++) {
      if (nairaToKobo(koboToNaira(kobo)) !== kobo) mismatches.push(kobo);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('koboSchema', () => {
  it('accepts safe integers', () => {
    expect(koboSchema.parse(225_800)).toBe(225_800);
    expect(koboSchema.parse(0)).toBe(0);
  });

  it.each([1.5, Number.NaN, 2 ** 53, '100'])('rejects %s', (value) => {
    expect(koboSchema.safeParse(value).success).toBe(false);
  });
});
