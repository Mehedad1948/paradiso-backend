import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movies/movie.entity';
import { MoviesModule } from '../movies/movies.module';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

@Module({
  controllers: [PeopleController],
  providers: [PeopleService],
  exports: [PeopleService],
  imports: [TypeOrmModule.forFeature([Movie]), MoviesModule],
})
export class PeopleModule {}
