import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movies/movie.entity';
import { MovieComment } from './movie-comment.entity';
import { MovieCommentsController } from './movie-comments.controller';
import { MovieCommentsService } from './movie-comments.service';

@Module({
  imports: [TypeOrmModule.forFeature([MovieComment, Movie])],
  controllers: [MovieCommentsController],
  providers: [MovieCommentsService],
})
export class MovieCommentsModule {}
