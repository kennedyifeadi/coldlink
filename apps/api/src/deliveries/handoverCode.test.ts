import { handoverCodeSchema } from '@coldlink/shared';
import { describe, expect, it } from 'vitest';
import { generateHandoverCode } from './handoverCode.js';

describe('generateHandoverCode', () => {
  it('is always four digits, the leading zeros kept', () => {
    const codes = Array.from({ length: 2000 }, generateHandoverCode);
    for (const code of codes) expect(handoverCodeSchema.parse(code)).toBe(code);
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
  });

  it('varies from one delivery to the next', () => {
    const codes = new Set(Array.from({ length: 200 }, generateHandoverCode));
    expect(codes.size).toBeGreaterThan(150);
  });
});
