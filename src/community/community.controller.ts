import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Auth } from '../auth/decorator/auth.decorator';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { CommunityService } from './community.service';
import {
  CommunityCommentDto,
  CommunityFeedDto,
  CommunityPageDto,
  CommunityReactionDto,
  CommunitySuggestedUsersDto,
  CommunityUserSearchDto,
  CreateCommunityPostDto,
  UpdateCommunityPostDto,
} from './community.dto';

@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('posts')
  @Auth(AuthType.Bearer, AuthType.none)
  @ApiOperation({
    summary:
      'Public movie recommendations, newest first. Private room posts are excluded.',
  })
  feed(@Query() query: CommunityFeedDto, @ActiveUser('sub') userId?: number) {
    return this.community.feed(query, userId);
  }

  @Get('following')
  followingFeed(
    @Query() query: CommunityFeedDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.feed(query, userId, undefined, true);
  }

  @Get('rooms/:roomId/posts')
  @Auth(AuthType.Bearer, AuthType.none)
  @ApiOperation({
    description:
      'Public rooms allow anonymous reading. Private rooms require a member access token.',
  })
  roomFeed(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() query: CommunityFeedDto,
    @ActiveUser('sub') userId?: number,
  ) {
    return this.community.feed(query, userId, roomId);
  }

  @Get('posts/:postId')
  @Auth(AuthType.Bearer, AuthType.none)
  getPost(
    @Param('postId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId?: number,
  ) {
    return this.community.getPost(id, userId);
  }

  @Post('posts')
  createPost(
    @Body() dto: CreateCommunityPostDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.createPost(dto, userId);
  }

  @Patch('posts/:postId')
  updatePost(
    @Param('postId', ParseIntPipe) id: number,
    @Body() dto: UpdateCommunityPostDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.updatePost(id, dto, userId);
  }

  @Post('posts/:postId/repost')
  @ApiOperation({
    summary: 'Repost a post as-is. Reposting twice returns the same repost.',
  })
  repost(
    @Param('postId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.repost(id, userId);
  }

  @Delete('posts/:postId/repost')
  undoRepost(
    @Param('postId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.undoRepost(id, userId);
  }

  @Put('posts/:postId/reaction')
  @ApiOperation({
    summary: 'Like (1) or dislike (-1) a post, replacing any earlier reaction.',
  })
  react(
    @Param('postId', ParseIntPipe) id: number,
    @Body() dto: CommunityReactionDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.react(id, dto.value, userId);
  }

  @Delete('posts/:postId/reaction')
  removeReaction(
    @Param('postId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.removeReaction(id, userId);
  }

  @Delete('posts/:postId')
  deletePost(
    @Param('postId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.deletePost(id, userId);
  }

  @Get('posts/:postId/comments')
  @Auth(AuthType.Bearer, AuthType.none)
  listComments(
    @Param('postId', ParseIntPipe) postId: number,
    @Query() query: CommunityPageDto,
    @ActiveUser('sub') userId?: number,
  ) {
    return this.community.listComments(postId, query, userId);
  }

  @Post('posts/:postId/comments')
  createComment(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() dto: CommunityCommentDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.createComment(postId, dto, userId);
  }

  @Delete('posts/:postId/comments/:commentId')
  deleteComment(
    @Param('postId', ParseIntPipe) postId: number,
    @Param('commentId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.deleteComment(postId, id, userId);
  }

  // Declared before users/:userId so "search" is not read as an ID.
  @Get('users/search')
  @Auth(AuthType.Bearer, AuthType.none)
  @ApiOperation({
    summary:
      'Find members by username, case-insensitive: prefix matches first, then contains. Excludes yourself.',
  })
  searchUsers(
    @Query() query: CommunityUserSearchDto,
    @ActiveUser('sub') userId?: number,
  ) {
    return this.community.searchUsers(query, userId);
  }

  // Declared before users/:userId so "suggested" is not read as an ID.
  @Get('users/suggested')
  @Auth(AuthType.Bearer, AuthType.none)
  @ApiOperation({
    summary:
      'People to follow: recent public posters, excluding yourself and anyone you follow.',
  })
  suggestedUsers(
    @Query() query: CommunitySuggestedUsersDto,
    @ActiveUser('sub') userId?: number,
  ) {
    return this.community.suggestedUsers(query, userId);
  }

  @Get('users/:userId')
  @Auth(AuthType.none)
  profile(@Param('userId', ParseIntPipe) id: number) {
    return this.community.profile(id);
  }

  @Get('users/:userId/recommendations')
  @Auth(AuthType.none)
  @ApiOperation({
    summary:
      'Movies the user recommends: their public posts rated 8 or higher, latest post per movie.',
  })
  recommendations(
    @Param('userId', ParseIntPipe) id: number,
    @Query() query: CommunityPageDto,
  ) {
    return this.community.recommendations(id, query);
  }

  @Put('users/:userId/follow')
  follow(
    @Param('userId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.follow(id, userId);
  }

  @Delete('users/:userId/follow')
  unfollow(
    @Param('userId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.community.unfollow(id, userId);
  }

  @Get('users/:userId/followers')
  @Auth(AuthType.none)
  followers(
    @Param('userId', ParseIntPipe) id: number,
    @Query() query: CommunityPageDto,
  ) {
    return this.community.listFollows(id, query, true);
  }

  @Get('users/:userId/following')
  @Auth(AuthType.none)
  following(
    @Param('userId', ParseIntPipe) id: number,
    @Query() query: CommunityPageDto,
  ) {
    return this.community.listFollows(id, query, false);
  }
}
