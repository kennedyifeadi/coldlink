import * as z from 'zod';

// Every phone column stores a Nigerian number as +234 and ten digits (PRD 5.1).
export const E164_PHONE = /^\+234\d{10}$/;

// Mobile ranges: 70x, 80x, 81x, 90x and 91x. Landlines and other ranges cannot receive the OTP.
const NATIONAL_MOBILE_NUMBER = /^(?:70|80|81|90|91)\d{8}$/;

// What people type: 08012345678, 8012345678, 2348012345678 or +2348012345678.
const TYPED_NUMBER = /^(?:\+?234|0)?(\d{10})$/;

const SEPARATORS = /[\s-]/g;

export const INVALID_PHONE_MESSAGE = 'Enter a Nigerian mobile number, like 0803 123 4567';

/** Returns the number as +234 and ten digits, or undefined if it is not a Nigerian mobile number. */
export function normalisePhone(input: string): string | undefined {
  const digits = TYPED_NUMBER.exec(input.trim().replace(SEPARATORS, ''))?.[1];
  if (digits === undefined || !NATIONAL_MOBILE_NUMBER.test(digits)) return undefined;
  return `+234${digits}`;
}

/** Accepts a number as typed and outputs it as +234 and ten digits. */
export const phoneSchema = z.string().transform((input, ctx) => {
  const phone = normalisePhone(input);
  if (phone === undefined) {
    ctx.addIssue({ code: 'custom', message: INVALID_PHONE_MESSAGE });
    return z.NEVER;
  }
  return phone;
});

export const e164PhoneSchema = z.string().regex(E164_PHONE, 'Must be +234 and ten digits');

/** Keeps the network prefix and the last four digits, for showing a user their own number. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 7)}***${phone.slice(-4)}`;
}
