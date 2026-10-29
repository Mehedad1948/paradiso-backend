import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { CurationsService } from './curations.service';

// No cache headers: the frontend caches both lists and drops them when an
// admin saves.
@Controller('curations')
export class CurationsController {
  constructor(private readonly curations: CurationsService) {}

  @Get('landing-grid')
  @Auth(AuthType.none)
  @ApiOperation({
    summary: 'The landing page poster grid.',
    description:
      'Movies by grid slot (0–26), sorted by slot; empty slots are omitted. A cell shows imageUrl, or the movie poster_path when imageUrl is null. Cells whose movie has neither, or is blocked from the catalogue, are omitted. The same movie can fill several slots.',
  })
  landingGrid() {
    return this.curations.landingGrid();
  }

  @Get('editors-picks')
  @Auth(AuthType.none)
  @ApiOperation({
    summary: "The editors' picks pool for the landing page shelf.",
    description:
      'The whole pool (up to 40 movies) in the order the admin set, neither randomized nor limited: the frontend picks the day’s subset itself. Movies without a poster, or blocked from the catalogue, are omitted. An empty pool is a valid answer.',
  })
  editorsPicks() {
    return this.curations.editorsPicks();
  }
}
