import sharp from './sharp';

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif';

export const IMAGE_MIME: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export const IMAGE_EXTENSION: Record<ImageKind, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
};

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_DIMENSION = 512;
// Reject decompression bombs before they are decoded (about 6000x6000).
const MAX_INPUT_PIXELS = 36_000_000;

/** Detects the real image type from the file signature, ignoring name and MIME. */
export function detectImageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8)
    return buffer[2] === 0xff ? 'jpeg' : null;
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  )
    return 'png';
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  )
    return 'webp';
  if (
    buffer.length >= 6 &&
    ['GIF87a', 'GIF89a'].includes(buffer.toString('latin1', 0, 6))
  )
    return 'gif';
  return null;
}

/**
 * Re-encodes the image in the same format, which drops EXIF/ICC/XMP metadata,
 * after applying the EXIF orientation, and fits it inside 512x512.
 */
export async function processAvatar(
  buffer: Buffer,
  kind: Exclude<ImageKind, 'gif'>,
): Promise<Buffer> {
  const image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(AVATAR_MAX_DIMENSION, AVATAR_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  if (kind === 'jpeg') return image.jpeg({ quality: 85 }).toBuffer();
  if (kind === 'png') return image.png().toBuffer();
  return image.webp({ quality: 85 }).toBuffer();
}
