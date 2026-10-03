import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { CommunityService } from './community.service';
import { CommunityPost } from './community-post.entity';
import { CommunityComment } from './community-comment.entity';
import { UserFollow } from './user-follow.entity';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';
import { RoomInviteLink } from '../room-invite-links/room-invite-link.entity';
import { RoomAccessService } from '../rooms/providers/room-access.service';
import {
  CommunityCommentDto,
  CreateCommunityPostDto,
  UpdateCommunityPostDto,
} from './community.dto';

describe('Community permissions and privacy', () => {
  const post = {
    id: 12,
    authorId: 1,
    text: 'Watch this',
    rating: 8.5,
    roomId: null,
    author: {
      id: 1,
      username: 'Film fan',
      avatar: null,
      email: 'private@example.test',
      password: 'secret',
    },
    movie: {
      id: 'movie',
      title: 'A movie',
      dbId: 42,
      poster_path: '/poster.jpg',
    },
    room: null,
    promotedInvite: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    commentCount: 3,
  };
  let service: CommunityService;
  let builder: Record<string, jest.Mock>;
  let posts: {
    createQueryBuilder: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let access: {
    canRead: jest.Mock;
    checkUserRoomAccess: jest.Mock;
    requireOwner: jest.Mock;
  };
  let comments: { findOneBy: jest.Mock; delete: jest.Mock; save: jest.Mock };
  let invites: { findOne: jest.Mock };

  beforeEach(() => {
    builder = {};
    for (const method of [
      'leftJoin',
      'select',
      'loadRelationCountAndMap',
      'where',
      'andWhere',
      'orderBy',
      'take',
      'insert',
      'values',
      'orIgnore',
    ])
      builder[method] = jest.fn().mockReturnValue(builder);
    builder.getOne = jest.fn().mockResolvedValue({ ...post });
    builder.getMany = jest
      .fn()
      .mockResolvedValue([{ ...post }, { ...post, id: 11 }]);
    builder.execute = jest.fn().mockResolvedValue({});
    posts = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      delete: jest.fn(),
      update: jest.fn(),
    };
    const follows = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      delete: jest.fn(),
    };
    comments = { findOneBy: jest.fn(), delete: jest.fn(), save: jest.fn() };
    invites = { findOne: jest.fn() };
    access = {
      canRead: jest.fn().mockResolvedValue(false),
      checkUserRoomAccess: jest.fn().mockResolvedValue(false),
      requireOwner: jest.fn().mockRejectedValue(new ForbiddenException()),
    };
    const users = { findOne: jest.fn().mockResolvedValue(post.author) };
    const movies = { existsBy: jest.fn().mockResolvedValue(true) };
    service = new CommunityService(
      posts as unknown as Repository<CommunityPost>,
      comments as unknown as Repository<CommunityComment>,
      follows as unknown as Repository<UserFollow>,
      users as unknown as Repository<User>,
      movies as unknown as Repository<Movie>,
      invites as unknown as Repository<RoomInviteLink>,
      access as unknown as RoomAccessService,
    );
  });

  it('returns safe public fields, comment counts and movie poster fallback', async () => {
    const result = await service.getPost(12);
    expect(result.author).toEqual({
      id: 1,
      username: 'Film fan',
      avatar: null,
    });
    expect(result.imageUrl).toBe('/poster.jpg');
    expect(result.commentCount).toBe(3);
    expect(JSON.stringify(result)).not.toMatch(/secret|private@example/);
  });

  it('excludes private rooms from global feeds and returns a next cursor', async () => {
    const result = await service.feed({ limit: 1 });
    expect(builder.where).toHaveBeenCalledWith(
      '(post.roomId IS NULL OR room.isPublic = true)',
    );
    expect(result.data).toHaveLength(1);
    expect(result.nextCursor).toBe(12);
  });

  it('hides private posts and denies anonymous private room feeds', async () => {
    builder.getOne.mockResolvedValue({ ...post, roomId: 7 });
    await expect(service.getPost(12)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.feed({ limit: 20 }, undefined, 7),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.canRead).toHaveBeenCalledWith(7, 0);
  });

  it('allows private room reads by members and requires membership to comment', async () => {
    builder.getOne.mockResolvedValue({ ...post, roomId: 7 });
    access.canRead.mockResolvedValue(true);
    await expect(service.getPost(12, 2)).resolves.toMatchObject({ id: 12 });
    await expect(
      service.createComment(12, { text: 'Hi' }, 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comments.save).not.toHaveBeenCalled();
  });

  it('denies edits and deletions by unrelated users', async () => {
    await expect(
      service.updatePost(12, { text: 'Changed' }, 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deletePost(12, 2)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(posts.update).not.toHaveBeenCalled();
    expect(posts.delete).not.toHaveBeenCalled();
  });

  it('allows room owners to moderate room posts', async () => {
    builder.getOne.mockResolvedValue({ ...post, roomId: 7 });
    access.canRead.mockResolvedValue(true);
    access.requireOwner.mockResolvedValue(undefined);
    await service.deletePost(12, 2);
    expect(access.requireOwner).toHaveBeenCalledWith(7, 2);
    expect(posts.delete).toHaveBeenCalledWith(12);
  });

  it('denies room posts by nonmembers and promotions by nonowners', async () => {
    await expect(
      service.createPost(
        { movieId: 'movie', text: 'Hi', rating: 8, roomId: 7 },
        2,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    invites.findOne.mockResolvedValue({ id: 3, room: { id: 7 } });
    await expect(
      service.createPost(
        {
          movieId: 'movie',
          text: 'Hi',
          rating: 8,
          promotedInviteToken: 'token',
        },
        2,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('suppresses expired, revoked and exhausted invitation tokens', async () => {
    for (const invalid of [
      { isActive: false },
      { expiresAt: new Date(0) },
      { maxUsage: 1, uses: 1 },
    ]) {
      builder.getOne.mockResolvedValue({
        ...post,
        promotedInvite: {
          id: 3,
          token: 'token',
          room: { id: 7, name: 'Cinema' },
          isActive: true,
          expiresAt: null,
          maxUsage: 0,
          uses: 0,
          ...invalid,
        },
      });
      expect((await service.getPost(12)).promotion).toMatchObject({
        canJoin: false,
        token: null,
      });
    }
  });

  it('prevents self follows and makes repeated follows conflict safe', async () => {
    await expect(service.follow(1, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.follow(2, 1);
    expect(builder.values).toHaveBeenCalledWith({
      followerId: 1,
      followingId: 2,
    });
    expect(builder.orIgnore).toHaveBeenCalled();
  });

  it('cannot delete a comment belonging to another post', async () => {
    comments.findOneBy.mockResolvedValue(null);
    await expect(service.deleteComment(12, 99, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(comments.findOneBy).toHaveBeenCalledWith({ id: 99, postId: 12 });
    expect(comments.delete).not.toHaveBeenCalled();
  });
});

describe('Community input validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const valid = {
    movieId: 'd9428888-122b-4d4e-8b25-269d48835b2a',
    text: 'Great movie',
    rating: 8.5,
  };
  it('trims text and rejects empty text, invalid ratings, HTTP images and nulls', async () => {
    expect(
      await pipe.transform(
        { ...valid, text: ' Great movie ' },
        { type: 'body', metatype: CreateCommunityPostDto },
      ),
    ).toMatchObject(valid);
    for (const bad of [
      { text: '   ' },
      { rating: 11 },
      { rating: '8' },
      { rating: 8.55 },
      { imageUrl: 'http://example.com/image.jpg' },
      { roomId: null },
    ])
      await expect(
        pipe.transform(
          { ...valid, ...bad },
          { type: 'body', metatype: CreateCommunityPostDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects changing scope, null edits and blank comments', async () => {
    for (const bad of [{ roomId: 7 }, { text: null }, { rating: null }])
      await expect(
        pipe.transform(bad, { type: 'body', metatype: UpdateCommunityPostDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { text: '  ' },
        { type: 'body', metatype: CommunityCommentDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
