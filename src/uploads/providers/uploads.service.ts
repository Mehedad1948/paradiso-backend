import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Upload } from '../upload.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UploadToAwsProvider } from './upload-to-aws.provider';
import { ConfigService } from '@nestjs/config';
import { UploadFile } from '../interfaces/upload-file.interface';
import { fileTypes } from '../enums/file-types.enum';

@Injectable()
export class UploadsService {
  constructor(
    private readonly uploadToAwsProvider: UploadToAwsProvider,

    private readonly configService: ConfigService,

    @InjectRepository(Upload)
    private readonly uploadsRepository: Repository<Upload>,
  ) {}

  public async uploadFile(
    file: Express.Multer.File,
    folder: string = 'default',
  ) {
    if (
      !['image/gif', 'image/jpeg', 'image/jpg', 'image/png'].includes(
        file.mimetype,
      )
    ) {
      throw new BadRequestException('Mime type is not supported');
    }

    // Sanitize folder to avoid path traversal
    const sanitizedFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '');

    try {
      // Pass the folder to the file upload method
      const fileKey = await this.uploadToAwsProvider.fileUpload(
        file,
        sanitizedFolder,
      );

      const uploadFile: UploadFile = {
        name: fileKey,
        path: `https://${this.configService.get('appConfig.awsBucketName')}.${this.configService.get('appConfig.awsAddress')}/${fileKey}`,
        type: fileTypes.IMAGE,
        mime: file.mimetype,
        size: file.size,
      };

      const upload = this.uploadsRepository.create(uploadFile);
      return await this.uploadsRepository.save(upload);
    } catch (error) {
      console.error('➡️➡️➡️ UploadsService error', error);
      throw new ConflictException(error);
    }
  }
}
