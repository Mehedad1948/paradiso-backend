import {
  BadRequestException,
  ConflictException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Upload } from '../upload.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UploadToR2Provider } from './upload-to-r2.provider';
import { UploadFile } from '../interfaces/upload-file.interface';
import { fileTypes } from '../enums/file-types.enum';
import {
  AVATAR_MAX_BYTES,
  detectImageKind,
  IMAGE_EXTENSION,
  IMAGE_MIME,
  ImageKind,
  processAvatar,
} from '../image-utils';

const AVATAR_KINDS: ImageKind[] = ['jpeg', 'png', 'webp'];
const OTHER_KINDS: ImageKind[] = ['jpeg', 'png', 'webp', 'gif'];

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
    if (!file?.buffer?.length)
      throw new BadRequestException('A non-empty "file" field is required');

    // Sanitize folder to avoid path traversal
    const sanitizedFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '');
    const isAvatar = sanitizedFolder.split('/').find(Boolean) === 'avatars';

    // Trust the file signature, not the client-sent name or MIME type.
    const kind = detectImageKind(file.buffer);
    if (!kind || !(isAvatar ? AVATAR_KINDS : OTHER_KINDS).includes(kind))
      throw new UnsupportedMediaTypeException(
        isAvatar
          ? 'Avatars must be JPEG, PNG or WebP images.'
          : 'Only JPEG, PNG, WebP or GIF images are supported.',
      );
    if (isAvatar && file.buffer.length > AVATAR_MAX_BYTES)
      throw new PayloadTooLargeException(
        `Avatar images must be 2 MB or smaller (this file is ${(file.buffer.length / 1024 / 1024).toFixed(1)} MB).`,
      );
    if (isAvatar) {
      let buffer: Buffer;
      try {
        buffer = await processAvatar(file.buffer, kind as 'jpeg');
      } catch {
        throw new BadRequestException(
          'The image could not be read. Upload a valid JPEG, PNG or WebP file.',
        );
      }
      // Fixed name: the client-supplied name is not trusted or needed.
      file = {
        ...file,
        buffer,
        size: buffer.length,
        originalname: `avatar${IMAGE_EXTENSION[kind]}`,
      };
    }
    file = { ...file, mimetype: IMAGE_MIME[kind] };

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
