import { describe, expect, it } from 'vitest';
import { clipGsm7, gsm7Parts, gsm7Septets, toGsm7 } from './gsm7.js';

describe('gsm7Septets', () => {
  it('counts an extension character as two', () => {
    expect(gsm7Septets('a€b')).toBe(4);
  });

  it.each(['₦500', 'Ọyọ', '40 m²', 'it’s'])('refuses %s, which is not GSM-7', (text) => {
    expect(gsm7Septets(text)).toBeUndefined();
  });
});

describe('gsm7Parts', () => {
  it.each([
    [0, 1],
    [160, 1],
    [161, 2],
    [306, 2],
    [307, 3],
  ])('sends %i characters as %i part(s)', (length, parts) => {
    expect(gsm7Parts('a'.repeat(length))).toBe(parts);
  });

  it('is undefined for text outside GSM-7', () => {
    expect(gsm7Parts('₦')).toBeUndefined();
  });
});

describe('toGsm7', () => {
  it.each([
    ['Ọ̀yọ́ Cold Room', 'Oyo Cold Room'],
    ['Mama’s “Best” Store – Bodija…', 'Mama\'s "Best" Store - Bodija...'],
    ['₦ Fresh Store', 'Fresh Store'],
    ['12 Ring Road,\nIbadan', '12 Ring Road, Ibadan'],
    ['Store [A] {B} €', 'Store A B'],
    ['Cold 🧊 room', 'Cold room'],
  ])('makes %j plain', (typed, plain) => {
    expect(toGsm7(typed)).toBe(plain);
    expect(gsm7Septets(toGsm7(typed))).toBe(plain.length);
  });
});

describe('clipGsm7', () => {
  it('leaves text that fits', () => {
    expect(clipGsm7('Bodija Market', 13)).toBe('Bodija Market');
  });

  it('cuts longer text to the limit with an ellipsis', () => {
    const clipped = clipGsm7('Bodija Market Cold Room', 16);
    expect(clipped).toBe('Bodija Market...');
    expect(clipped).toHaveLength(16);
  });
});
