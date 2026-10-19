import { describe, expect, it } from 'vitest';
import { findHexColours } from './check-hex-colours.js';

describe('findHexColours', () => {
  it('finds hex colours in arbitrary Tailwind classes with their position', () => {
    const source = 'const a = 1;\n<div className="p-4 bg-[#7FB069] text-[#fff]" />';

    expect(findHexColours(source)).toEqual([
      { line: 2, column: 25, value: '#7FB069' },
      { line: 2, column: 40, value: '#fff' },
    ]);
  });

  it('finds 4- and 8-digit hex colours', () => {
    expect(
      findHexColours('shadow-[0_0_4px_#0008] shadow-[#000_0_1px] border-[#233d22cc]').map(
        (m) => m.value,
      ),
    ).toEqual(['#0008', '#000', '#233d22cc']);
  });

  it('ignores booking references, entities and numbered labels', () => {
    expect(findHexColours('Order #882-991A, Unit #4, &#123;, #123abc-x')).toEqual([]);
  });

  it('ignores hash runs that are not 3, 4, 6 or 8 digits', () => {
    expect(findHexColours('#12345 #1234567 #abcdefabc')).toEqual([]);
  });

  it('returns nothing for empty input', () => {
    expect(findHexColours('')).toEqual([]);
  });
});
