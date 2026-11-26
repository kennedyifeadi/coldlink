import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { ApiError, type ApiErrorCode } from './client';
import { describeApiError } from './describeError';

const messageFor = (code: ApiErrorCode, retryAfterSeconds?: number) =>
  describeApiError(new ApiError(code, 'raw API message', { retryAfterSeconds }), i18n.t);

describe('describeApiError', () => {
  it.each<[ApiErrorCode, string]>([
    ['otp_invalid', 'That code is wrong or expired. Check the SMS or get a new code.'],
    ['consent_required', 'Agree to the privacy notice to create your ColdLink ID.'],
    ['account_disabled', 'This account is turned off. Contact ColdLink support.'],
    ['network', 'No connection. Check your data, then try again.'],
    ['unauthorized', "You've been signed out. Sign in to continue."],
    ['internal', 'Something went wrong on our side. Try again.'],
    ['unexpected_response', 'Something went wrong on our side. Try again.'],
  ])('explains %s', (code, message) => {
    expect(messageFor(code)).toBe(message);
  });

  it.each([
    [1, 'Too many tries. Try again in 1 second.'],
    [42, 'Too many tries. Try again in 42 seconds.'],
    [60, 'Too many tries. Try again in 1 minute.'],
    [61, 'Too many tries. Try again in 2 minutes.'],
  ])('says how long to wait when rate limited for %i s', (seconds, message) => {
    expect(messageFor('rate_limited', seconds)).toBe(message);
  });

  it('asks to wait a little when the API gives no wait', () => {
    expect(messageFor('rate_limited')).toBe('Too many tries. Wait a moment, then try again.');
  });

  it('never shows the raw message, even for an unknown error', () => {
    expect(describeApiError(new Error('TypeError: x is undefined'), i18n.t)).toBe(
      'Something went wrong on our side. Try again.',
    );
  });
});
