import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { Express } from 'express';
import { UploadsService } from './providers/uploads.service';
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadService: UploadsService) {}
  // Hard ceiling for any folder (buffered in memory); avatars are capped at 2 MB
  // by the service because the folder field may arrive after the file.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', default: 'default' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a new image to server.',
    description:
      'Requires a signed-in session. The real file type is checked: JPEG, PNG, WebP (and GIF outside folder=avatars). With folder=avatars the file must be at most 2 MB; metadata is stripped and the image is resized to fit 512x512. Errors: 400 unreadable/missing file, 413 too large, 415 unsupported type.',
  })
  @Post('file')
  public uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string,
  ) {
    return this.uploadService.uploadFile(
      file,
      typeof folder === 'string' && folder ? folder : undefined,
    );
  }
}
