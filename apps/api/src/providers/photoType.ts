import type { ProviderPhotoType } from '@coldlink/shared';

const signatures: { type: ProviderPhotoType; matches: (bytes: Buffer) => boolean }[] = [
  {
    type: 'image/jpeg',
    matches: (bytes) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    type: 'image/png',
    matches: (bytes) =>
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    type: 'image/webp',
    matches: (bytes) =>
      bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
      bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/**
 * The image type the file's leading bytes show, whatever its Content-Type claimed. Photos are
 * served back with their stored type, so trusting the header would let any file in as an "image".
 */
export function detectPhotoType(bytes: Buffer): ProviderPhotoType | undefined {
  return signatures.find((signature) => signature.matches(bytes))?.type;
}
