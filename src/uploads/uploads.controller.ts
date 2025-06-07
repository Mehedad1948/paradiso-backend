import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiHeaders, ApiOperation } from '@nestjs/swagger';
import { Express } from 'express';
import { UploadsService } from './providers/uploads.service';
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadService: UploadsService) {}
  @UseInterceptors(FileInterceptor('file'))
  @ApiHeaders([
    { name: 'Content-Type', description: 'multipart/form-data' },
    { name: 'Authorization', description: 'Bearer Token' },
  ])
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
