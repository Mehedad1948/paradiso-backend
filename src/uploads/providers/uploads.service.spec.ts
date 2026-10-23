import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from '../sharp';
import { Repository } from 'typeorm';
import { AUTH_TYPE_KEY } from '../../auth/constants/auth.constants';
import { AuthType } from '../../auth/enums/auth.decorator';
import { Upload } from '../upload.entity';
import { UploadsController } from '../uploads.controller';
import { UploadToR2Provider } from './upload-to-r2.provider';
import { UploadsService } from './uploads.service';

const image = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 30, b: 30 },
    },
  });
const file = (
  buffer: Buffer,
  originalname = 'photo.png',
  mimetype = 'image/png',
) =>
  ({
    buffer,
    originalname,
    mimetype,
    size: buffer.length,
  }) as Express.Multer.File;

describe('avatar upload hardening', () => {
  let uploaded: Express.Multer.File | undefined;
  const fileUpload = jest.fn((f: Express.Multer.File, folder: string) => {
    uploaded = f;
    return Promise.resolve(`paradiso/${folder}/${f.originalname}`);
  });
  const provider = {
    fileUpload,
    getPublicUrl: (key: string) => `https://cdn.example.test/${key}`,
  } as unknown as UploadToR2Provider;
  const repository = {
    create: (record: Partial<Upload>) => record,
    save: (record: Partial<Upload>) => Promise.resolve({ id: 1, ...record }),
  } as unknown as Repository<Upload>;
  const service = new UploadsService(provider, repository);

  beforeEach(() => {
    uploaded = undefined;
    fileUpload.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it.each([
    ['jpeg', () => image(40, 40).jpeg().toBuffer(), 'image/jpeg'],
    ['png', () => image(40, 40).png().toBuffer(), 'image/png'],
    ['webp', () => image(40, 40).webp().toBuffer(), 'image/webp'],
  ])('accepts a real %s avatar', async (_kind, make, mime) => {
    const result = await service.uploadFile(
      file(await make(), 'me.bin', 'application/octet-stream'),
      'avatars',
    );
    expect(result.mime).toBe(mime);
    expect(uploaded?.mimetype).toBe(mime);
  });

  it('rejects files whose real type is not JPEG, PNG or WebP, whatever the name or MIME', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40)]);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    for (const [bytes, name, mime] of [
      [gif, 'a.gif', 'image/gif'],
      [svg, 'a.svg', 'image/svg+xml'],
      [html, 'a.png', 'image/png'], // spoofed extension and MIME
      [exe, 'a.jpg', 'image/jpeg'],
    ] as const) {
      const call = service.uploadFile(file(bytes, name, mime), 'avatars');
      await expect(call).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
      await expect(call).rejects.toThrow(/JPEG, PNG or WebP/);
    }
    expect(fileUpload).not.toHaveBeenCalled();
  });

  it('rejects avatars over 2 MB with a readable 413', async () => {
    const big = Buffer.concat([
      await image(10, 10).png().toBuffer(),
      Buffer.alloc(2 * 1024 * 1024),
    ]);
    const call = service.uploadFile(file(big), 'avatars');
    await expect(call).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(call).rejects.toThrow(/2 MB or smaller/);
    expect(fileUpload).not.toHaveBeenCalled();
  });

  it('applies the avatar rules to nested avatars folders too', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40)]);
    await expect(
      service.uploadFile(file(gif, 'a.gif', 'image/gif'), 'avatars/../x'),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('rejects a corrupt image and a missing file', async () => {
    const corrupt = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      Buffer.alloc(64, 1),
    ]);
    await expect(
      service.uploadFile(file(corrupt), 'avatars'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadFile(undefined as unknown as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('strips EXIF metadata and fits large images into 512x512', async () => {
    const original = await image(1600, 800)
      .withExif({ IFD0: { Copyright: 'secret-owner', Artist: 'secret' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    await service.uploadFile(
      file(original, 'IMG 1.jpg', 'image/jpeg'),
      'avatars',
    );
    const meta = await sharp(uploaded!.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(uploaded!.buffer.includes(Buffer.from('secret-owner'))).toBe(false);
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([512, 256]);
    expect(uploaded!.originalname).toBe('avatar.jpg');
  });

  it('does not enlarge small images and applies EXIF orientation before stripping', async () => {
    const rotated = await image(100, 50)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    await service.uploadFile(file(rotated), 'avatars');
    const meta = await sharp(uploaded!.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([50, 100]);
  });

  it('keeps non-avatar uploads working, with the real type verified', async () => {
    const png = await image(1000, 1000).png().toBuffer();
    await service.uploadFile(file(png), 'posters');
    expect(uploaded?.buffer).toBe(png); // not re-encoded
    await expect(
      service.uploadFile(file(Buffer.from('not an image')), 'posters'),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('stays behind authentication', () => {
    const handler = UploadsController.prototype['uploadFile'] as object;
    const types =
      (Reflect.getMetadata(AUTH_TYPE_KEY, handler) as AuthType[] | undefined) ??
      (Reflect.getMetadata(AUTH_TYPE_KEY, UploadsController) as
        | AuthType[]
        | undefined);
    expect(types?.includes(AuthType.none) ?? false).toBe(false);
  });
});
