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
    '8012345678',
    '801 234 5678',
    '801-234-5678',
  ])('masks %s', (phone) => {
    expect(maskPhoneNumbers(`call ${phone} now`)).toBe(`call ${REDACTED_PHONE} now`);
  });

  it.each([
    '0803123456',
    '080312345678',
    '06031234567',
    'booking 1234567890123',
    '6012345678',
    '80123456789',
  ])('leaves %s alone', (text) => {
    expect(maskPhoneNumbers(text)).toBe(text);
  });

  it.each(['/api/v1/x?page=135480', 'amount 135480 kobo'])(
    'leaves the 6-digit number in %s alone',
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

  it.each(['/api/v1/users/08031234567', '/api/v1/users/8012345678'])(
    'masks a phone number in the path %s',
    (url) => {
      expect(redactUrl(url)).toBe(`/api/v1/users/${REDACTED_PHONE}`);
    },
  );

  it('masks a percent-encoded phone number in the path', () => {
    expect(redactUrl('/api/v1/users/%2B234%20801%20234%205678/bookings')).toBe(
      `/api/v1/users/${REDACTED_PHONE}/bookings`,
    );
  });

  it.each(['%2B234%20801%20234%205678', '%2B234+801+234+5678', '801%20234%205678'])(
    'masks the encoded phone number %s in a free-text query value',
    (encoded) => {
      expect(redactUrl(`/api/v1/y?q=${encoded}&page=2`)).toBe(
        `/api/v1/y?q=${REDACTED_PHONE}&page=2`,
      );
    },
  );

  it('leaves a non-phone query value alone', () => {
    expect(redactUrl('/api/v1/y?page=135480&amount=135480')).toBe(
      '/api/v1/y?page=135480&amount=135480',
    );
  });

  it('does not throw on a malformed percent escape, and still masks the rest', () => {
    expect(redactUrl('/api/v1/%E0%A4%A/8012345678?q=%ZZ&r=8012345678')).toBe(
      `/api/v1/%E0%A4%A/${REDACTED_PHONE}?q=%ZZ&r=${REDACTED_PHONE}`,
    );
  });
});
