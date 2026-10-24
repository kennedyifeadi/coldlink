import { describe, expect, it } from 'vitest';
import { maskPhoneNumbers, redact, redactUrl, REDACTED, REDACTED_PHONE } from './redact.js';

describe('maskPhoneNumbers', () => {
  it.each([
    '08031234567',
    '+2348031234567',
    '2348031234567',
    '+234 803 123 4567',
    '0803-123-4567',
    '07011112222',
    '09151234567',
  ])('masks %s', (phone) => {
    expect(maskPhoneNumbers(`call ${phone} now`)).toBe(`call ${REDACTED_PHONE} now`);
  });

  it.each(['0803123456', '080312345678', '06031234567', 'booking 1234567890123'])(
    'leaves %s alone',
    (text) => {
      expect(maskPhoneNumbers(text)).toBe(text);
    },
  );
});

describe('redact', () => {
  it('replaces sensitive keys at any depth, whatever their case or separators', () => {
    expect(
      redact({
        phone: '08031234567',
        user: { phoneNumber: '08031234567', name: 'Ade' },
        otp: '123456',
        otp_code: '123456',
        headers: { Authorization: 'Bearer abc', cookie: 'sid=1', 'x-api-key': 'k' },
        tokens: [{ refresh_token: 'r' }],
        password: 'p',
      }),
    ).toEqual({
      phone: REDACTED,
      user: { phoneNumber: REDACTED, name: 'Ade' },
      otp: REDACTED,
      otp_code: REDACTED,
      headers: { Authorization: REDACTED, cookie: REDACTED, 'x-api-key': REDACTED },
      tokens: REDACTED,
      password: REDACTED,
    });
  });

  it('masks phone numbers in strings under other keys', () => {
    expect(redact({ note: 'farmer on +2348031234567', list: ['08031234567'] })).toEqual({
      note: `farmer on ${REDACTED_PHONE}`,
      list: [REDACTED_PHONE],
    });
  });

  it('leaves non-plain objects for their serializers', () => {
    const error = new Error('08031234567');
    expect(redact({ err: error })).toEqual({ err: error });
  });
});

describe('redactUrl', () => {
  it('redacts sensitive query values and phone numbers', () => {
    expect(redactUrl('/api/v1/x?phone=08031234567&token=abc&page=2&q=08031234567')).toBe(
      `/api/v1/x?phone=${REDACTED}&token=${REDACTED}&page=2&q=${REDACTED_PHONE}`,
    );
  });

  it('masks a phone number in the path', () => {
    expect(redactUrl('/api/v1/users/08031234567')).toBe(`/api/v1/users/${REDACTED_PHONE}`);
  });
});
