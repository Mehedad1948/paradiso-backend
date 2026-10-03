import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './providers/uploads.service';
import { UploadToR2Provider } from './providers/upload-to-r2.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Upload } from './upload.entity';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UploadToR2Provider],
  imports: [TypeOrmModule.forFeature([Upload])],
})
export class UploadsModule {}
