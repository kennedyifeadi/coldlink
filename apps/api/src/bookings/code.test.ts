import { bookingCodeSchema } from '@coldlink/shared';
import { describe, expect, it } from 'vitest';
import { generateBookingCode } from './code.js';

describe('generateBookingCode', () => {
  it('makes codes the database check accepts', () => {
    for (let i = 0; i < 1000; i += 1) {
      expect(bookingCodeSchema.safeParse(generateBookingCode()).success).toBe(true);
    }
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateBookingCode));
    // 32^5 codes: two equal ones among a thousand happen about once in 67 runs.
    expect(codes.size).toBeGreaterThanOrEqual(998);
  });
});
