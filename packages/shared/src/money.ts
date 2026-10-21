import * as z from 'zod';
import { toScaledInteger } from './decimal.js';

// Money is a number holding a safe integer of kobo, never a float of naira (decision 16).
const KOBO_PER_NAIRA = 100;

export const koboSchema = z.int('Must be a whole number of kobo');

export function nairaToKobo(naira: number): number {
  const kobo = toScaledInteger(naira, KOBO_PER_NAIRA);
  if (kobo === undefined) {
    throw new RangeError(`Cannot convert ${naira} naira to a whole number of kobo`);
  }
  return kobo;
}

export function koboToNaira(kobo: number): number {
  if (!Number.isSafeInteger(kobo)) {
    throw new RangeError(`Expected a whole number of kobo, got ${kobo}`);
  }
  return kobo / KOBO_PER_NAIRA;
}
