import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { ListFeaturedArtistsDto } from './featured-artists.dto';
import { FeaturedArtistsService } from './featured-artists.service';
import { secondsUntilNextUtcDay } from './utc-date';

const MAX_AGE = 300;
const REVALIDATE = 600;
// While the day's pick is missing the feed shows an older one; look again soon.
const STAND_IN_MAX_AGE = 60;

@Controller('featured-artists')
export class FeaturedArtistsController {
  constructor(private readonly featured: FeaturedArtistsService) {}

  @Get()
  @Auth(AuthType.none)
  @ApiOperation({
    summary: 'The featured artist of the day and the days before it.',
    description:
      'Item 0 is today (UTC) and the same for everyone; the rest are earlier days, newest first. Only item 0 carries knownFor and libraryFilmCount. Open the artist with GET /people/{tmdbPersonId}.',
  })
  async list(
    @Query() { limit }: ListFeaturedArtistsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.featured.list(limit);
    const maxAge = result.data[0].isToday ? MAX_AGE : STAND_IN_MAX_AGE;
    // Shared caches must not keep yesterday's pick past midnight UTC.
    const sMaxAge = Math.min(maxAge, secondsUntilNextUtcDay());
    res.setHeader(
      'Cache-Control',
      `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${REVALIDATE}`,
    );
    return result;
  }
}
