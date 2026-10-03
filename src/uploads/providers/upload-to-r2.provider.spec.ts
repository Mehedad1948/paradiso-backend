import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Upload } from '../upload.entity';
import { UploadToR2Provider } from './upload-to-r2.provider';
import { UploadsService } from './uploads.service';

describe('Cloudflare R2 image uploads', () => {
  const endpoint =
    'https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com';
  const config = new ConfigService({
    appConfig: {
      r2BucketName: 'images',
      r2Endpoint: endpoint,
      r2AccessKey: 'test-access-key',
      r2SecretKey: 'test-secret-key',
      r2PublicUrl: 'https://images.example.test/',
    },
  });
  const file = {
    originalname: 'پوستر #1.png',
    mimetype: 'image/png',
    buffer: Buffer.from('test-image'),
    size: 10,
  } as Express.Multer.File;

  afterEach(() => jest.restoreAllMocks());

  it('configures the SDK for the R2 endpoint and auto region', async () => {
    const provider = new UploadToR2Provider(config);
    const client = (provider as unknown as { s3Client: S3Client }).s3Client;
    expect(await client.config.region()).toBe('auto');
    expect(await client.config.credentials()).toMatchObject({
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });
    expect(await client.config.endpoint!()).toMatchObject({
      protocol: 'https:',
      hostname: new URL(endpoint).hostname,
    });
    client.destroy();
  });

  it('uploads the image bytes and persists an encoded public URL', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
    const provider = new UploadToR2Provider(config);
    const create = jest.fn((record: Partial<Upload>) => record);
    const save = jest.fn((record: Partial<Upload>) =>
      Promise.resolve({ id: 1, ...record }),
    );
    const repository = { create, save } as unknown as Repository<Upload>;
    const service = new UploadsService(provider, repository);

    const result = await service.uploadFile(file, 'avatars/../');
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'images',
      Body: file.buffer,
      ContentType: 'image/png',
    });
    expect(command.input.Key).toMatch(
      /^paradiso\/avatars\/\/\/پوستر#1-\d+-[a-f0-9-]+\.png$/,
    );
    expect(result).toMatchObject({
      id: 1,
      name: command.input.Key,
      path: provider.getPublicUrl(command.input.Key!),
      type: 'image',
      mime: file.mimetype,
      size: file.size,
    });
    expect(result.path).toContain('%23');
    expect(result.path).not.toContain('پوستر');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports upstream upload failures without saving an upload record', async () => {
    jest
      .spyOn(S3Client.prototype, 'send')
      .mockRejectedValue(new Error('R2 unavailable') as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new UploadToR2Provider(config);
    await expect(provider.fileUpload(file)).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );
    const save = jest.fn();
    const repository = {
      create: jest.fn(),
      save,
    } as unknown as Repository<Upload>;
    await expect(
      new UploadsService(provider, repository).uploadFile(file),
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
});
