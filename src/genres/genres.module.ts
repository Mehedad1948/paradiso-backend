import { Module } from '@nestjs/common';
import { GenresController } from './genres.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from './genre.entity';
import { GenresService } from './providers/genres.service';

@Module({
  controllers: [GenresController],
  providers: [GenresService],
  imports: [TypeOrmModule.forFeature([Genre])],
})
export class GenresModule {}
