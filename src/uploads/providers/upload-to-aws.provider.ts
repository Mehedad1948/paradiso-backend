import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

@Injectable()
export class UploadToAwsProvider {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get('appConfig.awsBucketName') as string;

    this.s3Client = new S3Client({
      region: 'default',
      endpoint: `https://${this.configService.get('appConfig.awsAddress')}`,
      credentials: {
        accessKeyId: this.configService.get('appConfig.awsAccessKey') as string,
        secretAccessKey: this.configService.get(
          'appConfig.awsSecretKey',
        ) as string,
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
      console.error('❌ AWS Upload Error:', error);
      throw new RequestTimeoutException('Failed to upload to S3');
    }
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
