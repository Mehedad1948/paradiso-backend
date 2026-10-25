import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { SetFavoritesDto } from './favorites.dto';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
@Auth(AuthType.Bearer)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: "The current user's favorite movies, in order." })
  list(@ActiveUser('sub') userId: number) {
    return this.favorites.list(userId);
  }

  @Put()
  @ApiOperation({
    summary:
      'Replace the favorites list. The array order becomes the display order.',
  })
  set(@Body() dto: SetFavoritesDto, @ActiveUser('sub') userId: number) {
    return this.favorites.set(userId, dto.movieIds);
  }

  @Get('users/:userId')
  @Auth(AuthType.none)
  @ApiOperation({
    summary: "A user's favorite movies, shown on their profile.",
  })
  listForUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.favorites.listForProfile(userId);
  }

  @Get(':movieId')
  has(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @ActiveUser('sub') userId: number,
  ) {
    return this.favorites.has(userId, movieId);
  }

  @Put(':movieId')
  @ApiOperation({
    summary:
      'Add a movie to the end of the favorites. Adding it twice is a no-op.',
  })
  add(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @ActiveUser('sub') userId: number,
  ) {
    return this.favorites.add(userId, movieId);
  }

  @Delete(':movieId')
  remove(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @ActiveUser('sub') userId: number,
  ) {
    return this.favorites.remove(userId, movieId);
  }
}
