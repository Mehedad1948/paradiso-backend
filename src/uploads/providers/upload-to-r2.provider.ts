import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

@Injectable()
export class UploadToR2Provider {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>(
      'appConfig.r2BucketName',
    );

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.configService.getOrThrow<string>('appConfig.r2Endpoint'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>(
          'appConfig.r2AccessKey',
        ),
        secretAccessKey: this.configService.getOrThrow<string>(
          'appConfig.r2SecretKey',
        ),
      },
    });
  }

  public async fileUpload(
    file: Express.Multer.File,
    folder = 'default',
  ): Promise<string> {
    const fileName = this.generateFileName(file);
    const key = `paradiso/${folder}/${fileName}`;

    const params = {
      Bucket: this.bucket,
      Body: file.buffer,
      Key: key,
      ContentType: file.mimetype,
    };

    try {
      await this.s3Client.send(new PutObjectCommand(params));
      return key;
    } catch (error) {
      console.error('R2 upload error:', error);
      throw new RequestTimeoutException('Failed to upload to Cloudflare R2');
    }
  }

  public getPublicUrl(key: string): string {
    const baseUrl = this.configService
      .getOrThrow<string>('appConfig.r2PublicUrl')
      .replace(/\/+$/, '');
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${baseUrl}/${encodedKey}`;
  }

  private generateFileName(file: Express.Multer.File): string {
    const baseName = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/\s+/g, '')
      .trim();
    const extension = path.extname(file.originalname);
    const timestamp = Date.now();
    return `${baseName}-${timestamp}-${uuid()}${extension}`;
  }
}
