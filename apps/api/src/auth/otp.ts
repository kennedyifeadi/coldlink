import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

// PRD 5.2: 6 digits, 10 minutes, 5 attempts.
export const OTP_TTL_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 5;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * HMAC-SHA256 keyed with the pepper, over the phone and the code (decision 54). Binding the phone
 * means a hash copied to another number's row matches nothing. A slow hash such as bcrypt would
 * not help: a million codes are cheap to try even at bcrypt speed, so what stops an offline guess
 * is the pepper, which is not in the database.
 */
export function hashOtp(pepper: string, phone: string, code: string): string {
  return createHmac('sha256', pepper).update(`${phone}:${code}`).digest('hex');
}

export function otpMatches(
  pepper: string,
  phone: string,
  code: string,
  storedHash: string,
): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashOtp(pepper, phone, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
