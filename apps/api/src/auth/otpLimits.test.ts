import { describe, expect, it } from 'vitest';
import { otpRetryAfterSeconds } from './otpLimits.js';

const now = new Date('2026-11-06T12:00:00Z');

function secondsAgo(...ages: number[]): Date[] {
  return ages.map((age) => new Date(now.getTime() - age * 1000));
}

describe('otpRetryAfterSeconds', () => {
  it('allows a first code', () => {
    expect(otpRetryAfterSeconds([], now)).toBeUndefined();
  });

  it('holds a resend for 60 seconds after the last code', () => {
    expect(otpRetryAfterSeconds(secondsAgo(0), now)).toBe(60);
    expect(otpRetryAfterSeconds(secondsAgo(45), now)).toBe(15);
    expect(otpRetryAfterSeconds(secondsAgo(59.5), now)).toBe(1);
    expect(otpRetryAfterSeconds(secondsAgo(60), now)).toBeUndefined();
  });

  it('allows a fifth code in an hour but not a sixth', () => {
    expect(otpRetryAfterSeconds(secondsAgo(120, 600, 1200, 1800), now)).toBeUndefined();
    // The oldest of the five ages out of the hour 1,200 seconds from now.
    expect(otpRetryAfterSeconds(secondsAgo(120, 600, 1200, 1800, 2400), now)).toBe(1200);
  });

  it('frees a slot once a code is more than an hour old', () => {
    expect(otpRetryAfterSeconds(secondsAgo(120, 600, 1200, 1800, 3600), now)).toBeUndefined();
  });

  it('allows ten codes a day but not an eleventh', () => {
    const hourly = (hours: number) => hours * 3600;
    const nine = secondsAgo(...[2, 3, 4, 5, 6, 7, 8, 9, 10].map(hourly));
    expect(otpRetryAfterSeconds(nine, now)).toBeUndefined();
    const ten = secondsAgo(...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(hourly));
    expect(otpRetryAfterSeconds(ten, now)).toBe(hourly(13));
  });

  it('reports the longest wait when several limits apply', () => {
    const ten = secondsAgo(10, 70, 130, 190, 250, ...[2, 3, 4, 5, 6].map((h) => h * 3600));
    expect(otpRetryAfterSeconds(ten, now)).toBe(18 * 3600);
  });
});
