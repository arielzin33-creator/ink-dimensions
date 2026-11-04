// Image upload validation (FR-010): PNG, JPEG or WebP only, content must match the declared
// type by magic bytes, and the decoded size is limited. SVG is never accepted (it can carry script).
import { sniffRaster } from '../providers/image/sniff.js';
import type { ImageType } from '../shared/schemas.js';
import { badRequest, HttpError, tooLarge } from './errors.js';

export function uploadBodyLimit(maxBytes: number): number {
  return Math.ceil((maxBytes * 4) / 3) + 16 * 1024;
}

export function decodeImage(contentType: ImageType, dataBase64: string, maxBytes: number): Buffer {
  if (Math.floor((dataBase64.length * 3) / 4) > maxBytes + 3) throw tooLarge(`Images must be at most ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const data = Buffer.from(dataBase64, 'base64');
  if (data.length === 0) throw badRequest('The image is empty.');
  if (data.length > maxBytes) throw tooLarge(`Images must be at most ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const actual = sniffRaster(data);
  if (!actual) throw new HttpError(415, 'unsupported_media_type', 'Only PNG, JPEG and WebP images are accepted.');
  if (actual !== contentType) throw new HttpError(415, 'unsupported_media_type', `The file is ${actual}, not ${contentType}.`);
  return data;
}
