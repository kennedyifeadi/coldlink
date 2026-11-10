import { describe, expect, it } from 'vitest';
import { detectPhotoType } from './photoType.js';

describe('detectPhotoType', () => {
  it.each([
    ['JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xdb]), 'image/jpeg'],
    ['PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [
      'WebP',
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8L')]),
      'image/webp',
    ],
  ])('recognises %s', (_name, bytes, type) => {
    expect(detectPhotoType(bytes)).toBe(type);
  });

  it.each([
    ['GIF', Buffer.from('GIF89a')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    [
      'a RIFF file that is not WebP',
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]),
    ],
    ['a truncated JPEG header', Buffer.from([0xff, 0xd8])],
    ['nothing', Buffer.alloc(0)],
  ])('refuses %s', (_name, bytes) => {
    expect(detectPhotoType(bytes)).toBeUndefined();
  });
});
