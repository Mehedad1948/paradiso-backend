import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { PaginationQueryDto } from '../common/pagination/dtos/pagination-query.dto';
import { WatchlistService } from './watchlist.service';

@Controller('watchlist')
@Auth(AuthType.Bearer)
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  @ApiOperation({ summary: "The current user's watchlist, newest first." })
  list(@Query() query: PaginationQueryDto, @ActiveUser('sub') userId: number) {
    return this.watchlist.list(userId, query);
  }

  @Get(':movieId')
  has(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @ActiveUser('sub') userId: number,
  ) {
    return this.watchlist.has(userId, movieId);
  }

  @Put(':movieId')
  @ApiOperation({
    summary: 'Add a movie to the watchlist. Adding it twice is a no-op.',
  })
  add(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @ActiveUser('sub') userId: number,
  ) {
    return this.watchlist.add(userId, movieId);
  }

  @Delete(':movieId')
  remove(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @ActiveUser('sub') userId: number,
  ) {
    return this.watchlist.remove(userId, movieId);
  }
}
