// Multiplies by a power of ten and returns the exact integer, so 1.005 × 1000 gives 1005 even
// though the float product is 1004.9999999999999. Returns undefined when the value has more
// decimal places than the scale allows, or the result is not a safe integer.
export function toScaledInteger(value: number, scale: number): number | undefined {
  const scaled = Math.round(value * scale);
  return Number.isSafeInteger(scaled) && scaled / scale === value ? scaled : undefined;
}
