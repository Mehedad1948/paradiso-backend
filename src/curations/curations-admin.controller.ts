import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { Auth } from '../auth/decorator/auth.decorator';
import { Roles } from '../auth/decorator/roles.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import {
  ReplaceEditorsPicksRequest,
  ReplaceLandingGridRequest,
} from './curations.dto';
import { CurationsService } from './curations.service';

// Site administration of the landing page lists. "admin" is the site-wide role
// in the access token, not a room's admin.
@Controller('admin/curations')
@Auth(AuthType.Bearer)
@Roles('admin')
export class AdminCurationsController {
  constructor(private readonly curations: CurationsService) {}

  @Get('landing-grid')
  @ApiOperation({
    summary: 'The landing grid as stored, for editing.',
    description:
      'Same as GET /curations/landing-grid plus updatedBy, but nothing is hidden: movies without a poster or image are returned so they can be fixed.',
  })
  getLandingGrid() {
    return this.curations.adminLandingGrid();
  }

  @Put('landing-grid')
  @ApiOperation({
    summary: 'Replace the whole landing grid.',
    description:
      'Saves the list in one transaction: all of it or none. 400 for a slot outside 0–26, a repeated slot, an imageUrl that is neither an https:// URL nor a path starting with /, or an objectPosition over 40 characters. 422 when a movieId is not in the library (the message names the ids). Returns the stored grid like GET /admin/curations/landing-grid.',
  })
  putLandingGrid(
    @Body() dto: ReplaceLandingGridRequest,
    @ActiveUser('sub') adminId: number,
  ) {
    return this.curations.replaceLandingGrid(dto, adminId);
  }

  @Get('editors-picks')
  @ApiOperation({
    summary: "The editors' picks pool as stored, for editing.",
    description:
      'Same as GET /curations/editors-picks plus updatedBy, but nothing is hidden: movies that lost their poster since they were picked are returned so they can be replaced.',
  })
  getEditorsPicks() {
    return this.curations.adminEditorsPicks();
  }

  @Put('editors-picks')
  @ApiOperation({
    summary: "Replace the whole editors' picks pool.",
    description:
      'Saves the list in one transaction: all of it or none. The order of movieIds becomes the display order. 400 for more than 40 ids or a repeated id. 422 when a movieId is not in the library (the message names the ids) or a movie has no poster. Returns the stored pool like GET /admin/curations/editors-picks.',
  })
  putEditorsPicks(
    @Body() dto: ReplaceEditorsPicksRequest,
    @ActiveUser('sub') adminId: number,
  ) {
    return this.curations.replaceEditorsPicks(dto, adminId);
  }
}
