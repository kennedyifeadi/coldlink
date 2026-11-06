import { describe, expect, it } from 'vitest';
import { generateOtp, hashOtp, otpMatches } from './otp.js';

const pepper = 'pepper-for-tests-0123456789abcdefghij';
const phone = '+2348031234567';

describe('generateOtp', () => {
  it('always returns 6 digits, keeping leading zeros', () => {
    const codes = Array.from({ length: 2000 }, generateOtp);
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(1900);
  });
});

describe('hashOtp', () => {
  it('is a hex HMAC-SHA256 that never contains the code', () => {
    const hash = hashOtp(pepper, phone, '048213');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('048213');
    expect(hashOtp(pepper, phone, '048213')).toBe(hash);
  });

  it('depends on the pepper, the phone and the code', () => {
    const hash = hashOtp(pepper, phone, '048213');
    expect(hashOtp(`${pepper}x`, phone, '048213')).not.toBe(hash);
    expect(hashOtp(pepper, '+2348031234568', '048213')).not.toBe(hash);
    expect(hashOtp(pepper, phone, '048214')).not.toBe(hash);
  });
});

describe('otpMatches', () => {
  const stored = hashOtp(pepper, phone, '048213');

  it('accepts the right code for the right number', () => {
    expect(otpMatches(pepper, phone, '048213', stored)).toBe(true);
  });

  it('rejects a wrong code, another number or another pepper', () => {
    expect(otpMatches(pepper, phone, '048214', stored)).toBe(false);
    expect(otpMatches(pepper, '+2348031234568', '048213', stored)).toBe(false);
    expect(otpMatches(`${pepper}x`, phone, '048213', stored)).toBe(false);
  });

  it('rejects a malformed stored hash instead of throwing', () => {
    expect(otpMatches(pepper, phone, '048213', 'hash')).toBe(false);
    expect(otpMatches(pepper, phone, '048213', '')).toBe(false);
  });
});
