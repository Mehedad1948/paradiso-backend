import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { DEFAULT_LANGUAGE } from '../../movies/providers/MovieDb.serviec';

export class GetPersonDto {
  @ApiPropertyOptional({
    type: String,
    pattern: '^[a-z]{2}(-[A-Z]{2})?$',
    default: DEFAULT_LANGUAGE,
    description:
      'TMDb language for the biography and titles. An empty biography falls back to en-US.',
  })
  @IsOptional()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  language: string = DEFAULT_LANGUAGE;
}
