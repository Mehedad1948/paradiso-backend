import { PartialType, PickType } from '@nestjs/swagger';
import { CreateMovieDto } from './create-movie.dto';

export class UpdateMovieDto extends PartialType(
  PickType(CreateMovieDto, [
    'title',
    'original_title',
    'release_date',
    'video',
    'overview',
    'poster_path',
    'vote_average',
    'imdbRate',
    'imdbLink',
    'isWatchedTogether',
  ] as const),
) {}
