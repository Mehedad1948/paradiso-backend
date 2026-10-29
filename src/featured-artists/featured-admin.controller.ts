import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { Auth } from '../auth/decorator/auth.decorator';
import { Roles } from '../auth/decorator/roles.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { paginationLinks } from '../common/pagination/pagination-links';
import {
  AdminFeaturedRangeDto,
  ListFeaturedCandidatesDto,
  SearchFeaturedPeopleDto,
  SetFeaturedArtistRequest,
  UpsertFeaturedCandidateRequest,
} from './featured-artists.dto';
import { FeaturedAdminService } from './featured-admin.service';
import { PositiveIntPipe } from './positive-int.pipe';

// Site administration of the featured artist. "admin" is the site-wide role
// in the access token, not a room's admin.
@Controller('admin')
@Auth(AuthType.Bearer)
@Roles('admin')
export class AdminFeaturedController {
  constructor(private readonly admin: FeaturedAdminService) {}

  @Get('featured-artists')
  @ApiOperation({
    summary: 'Featured days in a date range, scheduled future days included.',
    description:
      'Defaults to 30 days back and 30 days ahead; at most 120 days between from and to.',
  })
  listDays(@Query() { from, to }: AdminFeaturedRangeDto) {
    return this.admin.listDays(from, to);
  }

  @Get('featured-artists/:date')
  @ApiOperation({ summary: 'One featured day, or 404.' })
  getDay(@Param('date') date: string) {
    return this.admin.getDay(date);
  }

  @Put('featured-artists/:date')
  @ApiOperation({
    summary: 'Set or replace the pick for today or a future day.',
    description:
      'Marks the pick manual. Ignores cooldowns and blocks. 422 when the person is unknown to TMDb or has no photo or biography; 409 for a past day.',
  })
  setDay(
    @Param('date') date: string,
    @Body() dto: SetFeaturedArtistRequest,
    @ActiveUser('sub') adminId: number,
  ) {
    return this.admin.setDay(date, dto, adminId);
  }

  @Delete('featured-artists/:date')
  @ApiOperation({
    summary: 'Remove the pick for today or a future day.',
    description:
      'A removed pick for today is refilled by the next automatic draw. 409 for a past day.',
  })
  async removeDay(
    @Param('date') date: string,
    @ActiveUser('sub') adminId: number,
  ) {
    await this.admin.removeDay(date, adminId);
  }

  @Get('featured-candidates')
  @ApiOperation({
    summary: 'People with an editorial boost or block, newest change first.',
  })
  async listCandidates(
    @Query() query: ListFeaturedCandidatesDto,
    @Req() request: Request,
  ) {
    const page = await this.admin.listCandidates(query);
    return {
      ...page,
      links: paginationLinks(
        request,
        page.meta.itemsPerPage,
        page.meta.currentPage,
        page.meta.totalPages,
      ),
    };
  }

  @Put('featured-candidates/:tmdbPersonId')
  @ApiOperation({
    summary: 'Boost, block or annotate a person; only the fields sent change.',
    description:
      'Affects future automatic picks only. 422 for a boost outside 0–10, a person TMDb does not know, or a boost above 1 for someone without a photo.',
  })
  upsertCandidate(
    @Param('tmdbPersonId', new PositiveIntPipe()) tmdbPersonId: number,
    @Body() dto: UpsertFeaturedCandidateRequest,
    @ActiveUser('sub') adminId: number,
  ) {
    return this.admin.upsertCandidate(tmdbPersonId, dto, adminId);
  }

  @Delete('featured-candidates/:tmdbPersonId')
  @ApiOperation({
    summary: 'Remove the editorial row; the person is treated normally again.',
  })
  async removeCandidate(
    @Param('tmdbPersonId', new PositiveIntPipe()) tmdbPersonId: number,
    @ActiveUser('sub') adminId: number,
  ) {
    await this.admin.removeCandidate(tmdbPersonId, adminId);
  }

  @Get('featured-people/search')
  @ApiOperation({
    summary: 'Search TMDb people by name, with their featured status.',
    description:
      'eligible means the person has a photo and a biography. Pages hold 20 people.',
  })
  async searchPeople(
    @Query() { query, page }: SearchFeaturedPeopleDto,
    @Req() request: Request,
  ) {
    const result = await this.admin.searchPeople(query, page);
    return {
      ...result,
      links: paginationLinks(
        request,
        undefined,
        result.meta.currentPage,
        result.meta.totalPages,
      ),
    };
  }

  @Get('featured-people/:tmdbPersonId/preview')
  @ApiOperation({
    summary: 'How the next automatic draw would treat this person.',
    description:
      'Score, boost, cooldown and final weight, plus the reasons if they cannot be picked.',
  })
  previewPerson(
    @Param('tmdbPersonId', new PositiveIntPipe()) tmdbPersonId: number,
  ) {
    return this.admin.preview(tmdbPersonId);
  }
}
