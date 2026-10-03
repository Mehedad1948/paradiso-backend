import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Upload } from '../upload.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UploadToR2Provider } from './upload-to-r2.provider';
import { UploadFile } from '../interfaces/upload-file.interface';
import { fileTypes } from '../enums/file-types.enum';

@Injectable()
export class UploadsService {
  constructor(
    private readonly uploadToR2Provider: UploadToR2Provider,

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
      const fileKey = await this.uploadToR2Provider.fileUpload(
        file,
        sanitizedFolder,
      );

      const uploadFile: UploadFile = {
        name: fileKey,
        path: this.uploadToR2Provider.getPublicUrl(fileKey),
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
