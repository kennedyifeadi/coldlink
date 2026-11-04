import pg from 'pg';

/** Reads a Postgres `bigint` (every money column) as a number, refusing unsafe integers. */
export function parseBigint(text: string): number {
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`bigint ${text} is outside the safe integer range and cannot be read`);
  }
  return value;
}

// Postgres prints numeric without an exponent and keeps the column's scale ("1.500"), so this
// strips what a number would drop: trailing fractional zeros and leading zeros.
function canonicalDecimal(text: string): string {
  const [whole = '', fraction = ''] = text.split('.');
  const trimmedWhole = whole.replace(/^(-?)0+(?=\d)/, '$1');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction === '' ? trimmedWhole : `${trimmedWhole}.${trimmedFraction}`;
}

/**
 * Reads a Postgres `numeric` (quantities, rates, capacity) as a number, but only when the number
 * prints back as exactly the same decimal, so precision is never lost silently.
 */
export function parseNumeric(text: string): number {
  const value = Number(text);
  if (!Number.isFinite(value) || canonicalDecimal(String(value)) !== canonicalDecimal(text)) {
    throw new RangeError(`numeric ${text} cannot be read as a number without losing precision`);
  }
  return value;
}

// node-postgres turns a `date` into a Date at local midnight, which shifts the day in any time
// zone west of UTC. A storage period's dates stay 'YYYY-MM-DD' strings.
function parseDate(text: string): string {
  return text;
}

type TypeParser = (text: string) => unknown;

const parsers = new Map<number, TypeParser>([
  [pg.types.builtins.INT8, parseBigint],
  [pg.types.builtins.NUMERIC, parseNumeric],
  [pg.types.builtins.DATE, parseDate],
]);

// Given to the pool rather than set on the global pg.types, so no other client is affected.
export const typeParsers: pg.CustomTypesConfig = {
  getTypeParser: (oid, format) =>
    parsers.get(oid) ?? (pg.types.getTypeParser(oid, format) as TypeParser),
};
