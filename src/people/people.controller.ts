import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { GetPersonDto } from './dtos/get-person.dto';
import { PeopleService } from './people.service';

@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  // TMDb: a person's profile and filmography (no auth, so shared links and
  // link previews work). movieId marks films already in our library.
  @Get(':tmdbPersonId')
  @Auth(AuthType.none)
  async getPerson(
    @Param('tmdbPersonId') rawId: string,
    @Query() { language }: GetPersonDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const personId = Number(rawId);
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(personId))
      throw new BadRequestException('tmdbPersonId must be a positive integer');
    const person = await this.peopleService.getPerson(personId, language);
    // Short: movieId changes as films join the library.
    res.setHeader(
      'Cache-Control',
      'public, max-age=600, stale-while-revalidate=3600',
    );
    return person;
  }
}
