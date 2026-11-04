import { describe, expect, it } from 'vitest';
import { sniffRaster } from '../../src/providers/image/sniff.js';
import { decodeImage, uploadBodyLimit } from '../../src/server/uploads.js';
import { JPEG_HEAD, tinyPng } from '../helpers/images.js';

describe('image upload validation', () => {
  it('accepts a PNG declared as PNG', () => {
    const png = tinyPng();
    expect(decodeImage('image/png', png.toString('base64'), 1024).equals(png)).toBe(true);
  });

  it('rejects a mislabelled file, SVG and unknown bytes with 415', () => {
    expect(() => decodeImage('image/png', JPEG_HEAD.toString('base64'), 1024)).toThrow(expect.objectContaining({ status: 415 }));
    expect(() => decodeImage('image/png', Buffer.from('<svg onload="x"/>').toString('base64'), 1024)).toThrow(expect.objectContaining({ status: 415 }));
  });

  it('rejects images over the size limit with 413', () => {
    const big = Buffer.concat([tinyPng(), Buffer.alloc(2048)]);
    expect(() => decodeImage('image/png', big.toString('base64'), 1024)).toThrow(expect.objectContaining({ status: 413 }));
  });

  it('sniffs PNG, JPEG and WebP', () => {
    expect(sniffRaster(tinyPng())).toBe('image/png');
    expect(sniffRaster(JPEG_HEAD)).toBe('image/jpeg');
    expect(sniffRaster(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffRaster(Buffer.from('GIF89a'))).toBeNull();
  });

  it('sizes the JSON body limit for base64 overhead', () => {
    expect(uploadBodyLimit(3 * 1024 * 1024)).toBeGreaterThan(4 * 1024 * 1024);
  });
});
