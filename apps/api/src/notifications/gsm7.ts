// The GSM 03.38 alphabet. One character outside it sends the whole SMS as UCS-2, which fits 70
// characters a part instead of 160, so every message is kept to these.
const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
// Each is sent as an escape and the character, two septets.
const EXTENSION = '^{}\\[~]|€';

const basic = new Set(BASIC);
const extension = new Set(EXTENSION);

const SINGLE_PART_SEPTETS = 160;
// A part of a longer message gives 7 septets to the header that joins the parts.
const MULTIPART_SEPTETS = 153;

const PUNCTUATION: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
};

/** The septets the text takes, or undefined if a character is outside GSM-7. */
export function gsm7Septets(text: string): number | undefined {
  let septets = 0;
  for (const character of text) {
    if (basic.has(character)) septets += 1;
    else if (extension.has(character)) septets += 2;
    else return undefined;
  }
  return septets;
}

/** How many SMS parts the text is sent as, or undefined if it is not GSM-7. */
export function gsm7Parts(text: string): number | undefined {
  const septets = gsm7Septets(text);
  if (septets === undefined) return undefined;
  if (septets <= SINGLE_PART_SEPTETS) return 1;
  return Math.ceil(septets / MULTIPART_SEPTETS);
}

const plainCharacter = (character: string) =>
  PUNCTUATION[character] ?? (basic.has(character) ? character : ' ');

/**
 * Makes text that someone typed, such as a facility's name or address, safe for an SMS: one line,
 * accents dropped (Ọ̀yọ́ becomes Oyo), curly quotes and dashes made plain, and any other character
 * outside the basic GSM-7 alphabet, extension characters included, turned into a space.
 */
export function toGsm7(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/./gsu, plainCharacter)
      // Line breaks as well, which are GSM-7 but would split the message's one line.
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** As toGsm7, cut to `max` characters with "..." when it is longer. */
export function clipGsm7(text: string, max: number): string {
  const plain = toGsm7(text);
  return plain.length <= max ? plain : `${plain.slice(0, max - 3).trimEnd()}...`;
}
