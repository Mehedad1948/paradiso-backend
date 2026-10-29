import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesModule } from '../movies/movies.module';
import { CurationItem } from './curation-item.entity';
import { Curation } from './curation.entity';
import { AdminCurationsController } from './curations-admin.controller';
import { CurationsStore } from './curations-store';
import { CurationsController } from './curations.controller';
import { CurationsService } from './curations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Curation, CurationItem]), MoviesModule],
  controllers: [CurationsController, AdminCurationsController],
  providers: [CurationsStore, CurationsService],
})
export class CurationsModule {}
