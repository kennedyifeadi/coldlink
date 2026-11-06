import { describe, expect, it } from 'vitest';
import {
  e164PhoneSchema,
  INVALID_PHONE_MESSAGE,
  maskPhone,
  normalisePhone,
  phoneSchema,
} from './phone.js';

describe('normalisePhone', () => {
  it.each([
    '08012345678',
    '8012345678',
    '2348012345678',
    '+2348012345678',
    '0801 234 5678',
    '0801-234-5678',
    '+234 801 234 5678',
    '+234-801-234-5678',
    ' 08012345678 ',
    '234 8012345678',
  ])('normalises %j to +2348012345678', (input) => {
    expect(normalisePhone(input)).toBe('+2348012345678');
  });

  it.each([
    ['0703 123 4567', '+2347031234567'],
    ['08031234567', '+2348031234567'],
    ['08131234567', '+2348131234567'],
    ['09031234567', '+2349031234567'],
    ['09131234567', '+2349131234567'],
  ])('accepts the mobile prefix in %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['too short', '0803123456'],
    ['too long', '080312345678'],
    ['a landline', '01021234567'],
    ['a Lagos landline', '012345678'],
    ['the 71x range', '07131234567'],
    ['the 60x range', '06031234567'],
    ['the 82x range', '08231234567'],
    ['the 92x range', '09231234567'],
    ['a foreign number', '+14155550123'],
    ['+234 with a trunk 0', '+23408031234567'],
    ['letters', '0803ABC4567'],
    ['dots', '0803.123.4567'],
    ['a plus without 234', '+8031234567'],
    ['00 international prefix', '002348031234567'],
  ])('rejects %s', (_case, input) => {
    expect(normalisePhone(input)).toBeUndefined();
  });
});

describe('phoneSchema', () => {
  it('outputs the E.164 number', () => {
    expect(phoneSchema.parse('0803 123 4567')).toBe('+2348031234567');
  });

  it('explains an invalid number in plain words', () => {
    const result = phoneSchema.safeParse('12345');
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([INVALID_PHONE_MESSAGE]);
  });

  it('rejects a value that is not a string', () => {
    expect(phoneSchema.safeParse(8031234567).success).toBe(false);
  });
});

describe('e164PhoneSchema', () => {
  it('accepts only the stored format', () => {
    expect(e164PhoneSchema.safeParse('+2348031234567').success).toBe(true);
    expect(e164PhoneSchema.safeParse('08031234567').success).toBe(false);
  });
});

describe('maskPhone', () => {
  it('keeps the network prefix and the last four digits', () => {
    expect(maskPhone('+2348031234567')).toBe('+234803***4567');
  });
});
