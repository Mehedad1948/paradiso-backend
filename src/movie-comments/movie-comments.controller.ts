import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Auth } from '../auth/decorator/auth.decorator';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { ActiveUserData } from '../auth/interfaces/active-user-data.interface';
import {
  COMMENT_RATE_LIMIT,
  COMMENT_RATE_WINDOW_SECONDS,
  MovieCommentsService,
} from './movie-comments.service';
import {
  CreateMovieCommentDto,
  MovieCommentPageDto,
  MovieCommentRepliesPageDto,
  UpdateMovieCommentDto,
} from './movie-comments.dto';

// Anyone may read; writing needs a signed-in (and so verified) account, which
// keeps spam accountable and lets authors edit or delete their own comments.
@Controller('movies/:movieId/comments')
export class MovieCommentsController {
  constructor(private readonly comments: MovieCommentsService) {}

  @Get()
  @Auth(AuthType.none)
  @ApiOperation({
    summary: 'Top-level comments on a movie, newest first, with reply counts.',
  })
  list(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Query() query: MovieCommentPageDto,
  ) {
    return this.comments.list(movieId, query);
  }

  @Get(':commentId/replies')
  @Auth(AuthType.none)
  @ApiOperation({ summary: 'Replies to a comment, oldest first.' })
  listReplies(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Param('commentId', ParseIntPipe) id: number,
    @Query() query: MovieCommentRepliesPageDto,
  ) {
    return this.comments.listReplies(movieId, id, query);
  }

  @Post()
  @ApiOperation({
    summary: `Comment on a movie. At most ${COMMENT_RATE_LIMIT} comments per ${COMMENT_RATE_WINDOW_SECONDS} seconds; more returns 429.`,
  })
  create(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Body() dto: CreateMovieCommentDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.comments.create(movieId, dto, userId);
  }

  @Patch(':commentId')
  @ApiOperation({ summary: 'Edit your own comment.' })
  update(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Param('commentId', ParseIntPipe) id: number,
    @Body() dto: UpdateMovieCommentDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.comments.update(movieId, id, dto, userId);
  }

  @Delete(':commentId')
  @ApiOperation({ summary: 'Delete your own comment; admins can delete any.' })
  remove(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Param('commentId', ParseIntPipe) id: number,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.comments.remove(movieId, id, user);
  }
}
