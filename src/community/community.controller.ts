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
  CreateCommunityPostDto,
  UpdateCommunityPostDto,
} from './community.dto';

@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('posts')
  @Auth(AuthType.none)
  @ApiOperation({
    summary:
      'Public movie recommendations, newest first. Private room posts are excluded.',
  })
  feed(@Query() query: CommunityFeedDto) {
    return this.community.feed(query);
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

  @Get('users/:userId')
  @Auth(AuthType.none)
  profile(@Param('userId', ParseIntPipe) id: number) {
    return this.community.profile(id);
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
