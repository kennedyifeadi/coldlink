// Per-phone limits on sending codes (decision 54). They are counted from otp_codes, so they hold
// across API instances and restarts, unlike the in-memory per-IP limit.

/** A real SMS can take a minute to arrive on a busy network; a resend before then is a double tap. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Each code allows 5 guesses, so the hourly cap holds a guesser to 25 tries an hour on one number
 * and the daily cap to 50 a day: about a 1 in 20,000 chance a day of hitting a 6-digit code. A
 * farmer with a weak signal still gets five codes an hour.
 */
export const OTP_PHONE_LIMITS = [
  { windowSeconds: 60 * 60, max: 5 },
  { windowSeconds: 24 * 60 * 60, max: 10 },
] as const;

export const OTP_HISTORY_SECONDS = Math.max(...OTP_PHONE_LIMITS.map((l) => l.windowSeconds));
export const OTP_HISTORY_ROWS = Math.max(...OTP_PHONE_LIMITS.map((l) => l.max));

/**
 * Seconds until another code may be sent to the number, or undefined if one may be sent now.
 * `sentAt` holds when the recent codes were sent, newest first: at least the last
 * OTP_HISTORY_ROWS within OTP_HISTORY_SECONDS.
 */
export function otpRetryAfterSeconds(sentAt: readonly Date[], now: Date): number | undefined {
  const waitsMs: number[] = [];
  const newest = sentAt[0];
  if (newest !== undefined) {
    waitsMs.push(newest.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - now.getTime());
  }
  for (const { windowSeconds, max } of OTP_PHONE_LIMITS) {
    const windowStart = now.getTime() - windowSeconds * 1000;
    const inWindow = sentAt.filter((time) => time.getTime() > windowStart);
    // The code whose ageing out of the window frees a slot.
    const blocking = inWindow.length >= max ? inWindow[max - 1] : undefined;
    if (blocking !== undefined) waitsMs.push(blocking.getTime() - windowStart);
  }
  const waitMs = Math.max(0, ...waitsMs);
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : undefined;
}
