export const REDACTED = '[Redacted]';
export const REDACTED_PHONE = '[Redacted phone]';

// Matched against the key with case and separators removed, so `X-Api-Key`, `refresh_token`
// and `phoneNumber` all count.
const SENSITIVE_KEY = /phone|msisdn|otp|token|cookie|authorization|password|secret|apikey/;

// Nigerian mobile numbers: 0 or +234/234, then 70x, 80x, 81x, 90x or 91x and eight more
// digits, optionally separated by spaces or hyphens.
const NIGERIAN_PHONE = /(?<!\d)(?:\+?234[\s-]?|0)[789][01](?:[\s-]?\d){8}(?!\d)/g;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

export function maskPhoneNumbers(text: string): string {
  return text.replace(NIGERIAN_PHONE, REDACTED_PHONE);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Returns a copy with sensitive keys replaced and phone numbers masked in every string.
 * Only plain objects and arrays are walked; other objects (requests, errors) are left to
 * their log serializers.
 */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') return maskPhoneNumbers(value);
  if (Array.isArray(value)) return value.map(redact);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redact(entry),
    ]),
  );
}

export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return maskPhoneNumbers(url);
  const query = url
    .slice(queryStart + 1)
    .split('&')
    .map((pair) => {
      const key = pair.split('=', 1)[0] ?? '';
      return isSensitiveKey(key) ? `${key}=${REDACTED}` : pair;
    })
    .join('&');
  return maskPhoneNumbers(`${url.slice(0, queryStart)}?${query}`);
}
