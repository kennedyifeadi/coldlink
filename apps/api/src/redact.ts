export const REDACTED = '[Redacted]';
export const REDACTED_PHONE = '[Redacted phone]';

// Matched against the key with case and separators removed, so `X-Api-Key`, `refresh_token`
// and `phoneNumber` all count.
const SENSITIVE_KEY = /phone|msisdn|otp|token|cookie|authorization|password|secret|apikey/;

// Nigerian mobile numbers: an optional 0 or +234/234, then 70x, 80x, 81x, 90x or 91x and eight
// more digits, optionally separated by spaces or hyphens.
// The prefix is optional because forms take the bare 10-digit national number after a fixed
// +234; masking the odd 10-digit non-phone in a log is better than leaking a phone number.
const NIGERIAN_PHONE = /(?<!\d)(?:\+?234[\s-]?|0)?[789][01](?:[\s-]?\d){8}(?!\d)/g;

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

function decodeOrKeep(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // A malformed escape must not break logging; the raw text is still masked.
    return text;
  }
}

function decodeQueryValue(value: string): string {
  return decodeOrKeep(value.replace(/\+/g, ' '));
}

/** Masks a URL part in its decoded form, so percent-encoded phone numbers are caught too. */
function maskUrlPart(part: string, decode: (text: string) => string): string {
  const decoded = decode(part);
  const masked = maskPhoneNumbers(decoded);
  return masked === decoded ? maskPhoneNumbers(part) : masked;
}

function redactQueryPair(pair: string): string {
  const separator = pair.indexOf('=');
  if (separator === -1) return maskUrlPart(pair, decodeQueryValue);
  const key = pair.slice(0, separator);
  if (isSensitiveKey(decodeQueryValue(key))) return `${key}=${REDACTED}`;
  return `${key}=${maskUrlPart(pair.slice(separator + 1), decodeQueryValue)}`;
}

export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  const maskedPath = path
    .split('/')
    .map((segment) => maskUrlPart(segment, decodeOrKeep))
    .join('/');
  if (queryStart === -1) return maskedPath;
  const query = url
    .slice(queryStart + 1)
    .split('&')
    .map(redactQueryPair)
    .join('&');
  return `${maskedPath}?${query}`;
}
