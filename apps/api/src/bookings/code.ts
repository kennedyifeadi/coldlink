import { randomInt } from 'node:crypto';
import { BOOKING_CODE_ALPHABET, BOOKING_CODE_LENGTH } from '@coldlink/shared';

/** A random booking code, drawn from the CSPRNG so codes cannot be guessed from one another. */
export function generateBookingCode(): string {
  const characters = Array.from(
    { length: BOOKING_CODE_LENGTH },
    () => BOOKING_CODE_ALPHABET[randomInt(BOOKING_CODE_ALPHABET.length)],
  );
  return `CL-${characters.join('')}`;
}
