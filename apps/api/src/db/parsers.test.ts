import { describe, expect, it } from 'vitest';
import { parseBigint, parseNumeric } from './parsers.js';

describe('parseBigint', () => {
  it.each([
    ['0', 0],
    ['13548000', 13_548_000],
    ['-42', -42],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['-9007199254740991', Number.MIN_SAFE_INTEGER],
  ])('reads %s', (text, value) => {
    expect(parseBigint(text)).toBe(value);
  });

  it.each(['9007199254740992', '9007199254740993', '-9007199254740992', '9223372036854775807'])(
    'rejects %s, past the safe integer range',
    (text) => {
      expect(() => parseBigint(text)).toThrow(
        new RangeError(`bigint ${text} is outside the safe integer range and cannot be read`),
      );
    },
  );
});

describe('parseNumeric', () => {
  it.each([
    ['2', 2],
    ['1.500', 1.5],
    ['1234.567', 1234.567],
    ['0.001', 0.001],
    ['0.0750', 0.075],
    ['0.3000', 0.3],
    ['4.25', 4.25],
    ['-1.5', -1.5],
    ['999999999999.999', 999_999_999_999.999],
  ])('reads %s exactly', (text, value) => {
    expect(parseNumeric(text)).toBe(value);
  });

  it.each(['0.12345678901234567890', '12345678901234567.5', '9007199254740993', 'NaN', 'Infinity'])(
    'rejects %s, which a number cannot hold exactly',
    (text) => {
      expect(() => parseNumeric(text)).toThrow(RangeError);
    },
  );
});
