import { randomInt } from 'node:crypto';

/** A 4-digit code from `crypto.randomInt`, leading zeros kept (decision 145). */
export function generateHandoverCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0');
}
