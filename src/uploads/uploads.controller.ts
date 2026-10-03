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
  @UseInterceptors(FileInterceptor('file'))
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
  })
  @Post('file')
  public uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string,
  ) {
    console.log('❌❌❌', file, folder);

    return this.uploadService.uploadFile(file, folder);
  }
}
