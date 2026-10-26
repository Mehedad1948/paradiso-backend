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
import { CommunityPostReaction } from './community-post-reaction.entity';
import { UserFollow } from './user-follow.entity';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';
import { RoomInviteLink } from '../room-invite-links/room-invite-link.entity';
import { RoomAccessService } from '../rooms/providers/room-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CommunityCommentDto,
  CommunityReactionDto,
  CommunitySuggestedUsersDto,
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
    findOneBy: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let reactions: {
    query: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
    findOneBy: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let notifications: { notify: jest.Mock };
  let access: {
    canRead: jest.Mock;
    checkUserRoomAccess: jest.Mock;
    requireOwner: jest.Mock;
  };
  let comments: {
    findOneBy: jest.Mock;
    delete: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
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
      findOneBy: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({ id: 99 }),
      create: jest.fn((value: unknown) => value),
    };
    // Transactions run inline against the same repository mocks.
    const transaction = (repository: unknown) =>
      jest.fn((work: (manager: unknown) => unknown) =>
        work({ getRepository: () => repository }),
      );
    reactions = {
      query: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      delete: jest.fn(),
      findOneBy: jest.fn().mockResolvedValue(null),
      manager: { transaction: jest.fn() },
    };
    reactions.manager.transaction = transaction(reactions);
    notifications = { notify: jest.fn() };
    const follows = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      delete: jest.fn(),
    };
    comments = {
      findOneBy: jest.fn(),
      delete: jest.fn(),
      save: jest.fn().mockResolvedValue({ id: 5 }),
      create: jest.fn((value: unknown) => value),
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      manager: { transaction: jest.fn() },
    };
    comments.manager.transaction = transaction(comments);
    builder.getOneOrFail = jest.fn().mockResolvedValue({
      id: 5,
      postId: 12,
      text: 'So good',
      author: post.author,
    });
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
      reactions as unknown as Repository<CommunityPostReaction>,
      notifications as unknown as NotificationsService,
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

  it('serializes posts without a movie or rating, with engagement state', async () => {
    builder.getOne.mockResolvedValue({
      ...post,
      movie: null,
      movieId: null,
      rating: null,
    });
    reactions.query.mockResolvedValue([
      {
        id: 12,
        likeCount: 4,
        dislikeCount: 1,
        myReaction: -1,
        repostCount: 2,
        quoteCount: 3,
        reposted: true,
      },
    ]);
    const result = await service.getPost(12, 5);
    expect(result).toMatchObject({
      kind: 'post',
      movie: null,
      rating: null,
      imageUrl: null,
      likeCount: 4,
      dislikeCount: 1,
      myReaction: -1,
      repostCount: 2,
      quoteCount: 3,
      reposted: true,
    });
    expect(reactions.query.mock.calls[0][1]).toEqual([[12], 5]);
  });

  it('embeds the quoted post and tells quotes from reposts', async () => {
    const quoted = {
      id: 7,
      text: 'Original',
      rating: null,
      imageUrl: null,
      createdAt: new Date(),
      author: { id: 3, username: 'Other', avatar: null, password: 'secret' },
      movie: null,
    };
    builder.getOne.mockResolvedValue({
      ...post,
      quotedPostId: 7,
      quotedPost: quoted,
    });
    const quote = await service.getPost(12);
    expect(quote.kind).toBe('quote');
    expect(quote.quotedPost).toMatchObject({ id: 7, text: 'Original' });
    expect(JSON.stringify(quote)).not.toMatch(/secret/);
    builder.getOne.mockResolvedValue({
      ...post,
      text: '',
      quotedPostId: 7,
      quotedPost: quoted,
    });
    expect((await service.getPost(12)).kind).toBe('repost');
  });

  it('requires a movie for ratings and rejects editing reposts', async () => {
    await expect(
      service.createPost({ text: 'Hi', rating: 8 }, 2),
    ).rejects.toBeInstanceOf(BadRequestException);
    builder.getOne.mockResolvedValue({ ...post, movieId: null });
    await expect(
      service.updatePost(12, { rating: 9 }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    builder.getOne.mockResolvedValue({ ...post, text: '', quotedPostId: 7 });
    await expect(
      service.updatePost(12, { text: 'Edit' }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates general posts and quotes without a movie', async () => {
    builder.getOne.mockResolvedValue({ ...post });
    await service.createPost({ text: 'Cannot wait for the new film' }, 1);
    expect(posts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        movieId: null,
        rating: null,
        quotedPostId: null,
      }),
    );
    await service.createPost({ text: 'Agreed', quotedPostId: 12 }, 1);
    expect(posts.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ quotedPostId: 12, roomId: null }),
    );
  });

  it('keeps quotes and reposts of private room posts inside that room', async () => {
    const privatePost = {
      ...post,
      roomId: 7,
      room: { id: 7, name: 'Secret', isPublic: false },
    };
    builder.getOne.mockResolvedValue(privatePost);
    access.canRead.mockResolvedValue(true);
    access.checkUserRoomAccess.mockResolvedValue(true);
    await expect(
      service.createPost({ text: 'Leak', quotedPostId: 12, roomId: 8 }, 2),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.createPost({ text: 'Quote', quotedPostId: 12 }, 2);
    expect(posts.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ quotedPostId: 12, roomId: 7 }),
    );
    await service.repost(12, 2);
    expect(posts.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '', quotedPostId: 12, roomId: 7 }),
    );
    access.checkUserRoomAccess.mockResolvedValue(false);
    await expect(service.repost(12, 3)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reposts once, points reposts of reposts at the original, and undoes', async () => {
    posts.findOneBy.mockResolvedValue({ id: 50 });
    builder.getOne.mockResolvedValue({ ...post, id: 50 });
    await service.repost(12, 2);
    expect(posts.save).not.toHaveBeenCalled();
    posts.findOneBy.mockResolvedValue(null);
    builder.getOne
      .mockResolvedValueOnce({ ...post, id: 20, text: '', quotedPostId: 12 })
      .mockResolvedValueOnce({ ...post })
      .mockResolvedValue({ ...post, id: 99 });
    await service.repost(20, 2);
    expect(posts.create).toHaveBeenCalledWith(
      expect.objectContaining({ quotedPostId: 12, text: '' }),
    );
    await service.undoRepost(12, 2);
    expect(posts.delete).toHaveBeenCalledWith({
      authorId: 2,
      quotedPostId: 12,
      text: '',
    });
  });

  it('removes reposts when the original is deleted', async () => {
    await service.deletePost(12, 1);
    expect(posts.delete).toHaveBeenCalledWith({ quotedPostId: 12, text: '' });
    expect(posts.delete).toHaveBeenCalledWith(12);
  });

  it('stores one reaction per user and requires room membership', async () => {
    await service.react(12, -1, 2);
    expect(reactions.upsert).toHaveBeenCalledWith(
      { postId: 12, userId: 2, value: -1 },
      ['postId', 'userId'],
    );
    await service.removeReaction(12, 2);
    expect(reactions.delete).toHaveBeenCalledWith({ postId: 12, userId: 2 });
    builder.getOne.mockResolvedValue({ ...post, roomId: 7 });
    access.canRead.mockResolvedValue(true);
    await expect(service.react(12, 1, 3)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('notifies the author of new likes and comments, grouped per post', async () => {
    await service.react(12, -1, 2);
    expect(notifications.notify).not.toHaveBeenCalled();
    await service.react(12, 1, 2);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'post_liked',
        recipientId: 1,
        actorId: 2,
        postId: 12,
        groupKey: 'post_liked:12',
        data: expect.objectContaining({
          postExcerpt: 'Watch this',
          movieTitle: 'A movie',
        }),
      }),
      expect.anything(),
    );
    // Repeating a like is not a new like.
    notifications.notify.mockClear();
    reactions.findOneBy.mockResolvedValue({ value: 1 });
    await service.react(12, 1, 2);
    expect(notifications.notify).not.toHaveBeenCalled();
    await service.createComment(12, { text: 'So good' }, 2);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'post_commented',
        groupKey: 'post_commented:12',
        data: expect.objectContaining({ commentExcerpt: 'So good' }),
      }),
      expect.anything(),
    );
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

  it('suggests recent public posters, excluding the viewer and their follows', async () => {
    for (const method of [
      'innerJoin',
      'addSelect',
      'groupBy',
      'addOrderBy',
      'limit',
      'from',
    ])
      builder[method] = jest.fn().mockReturnValue(builder);
    builder.subQuery = jest.fn().mockReturnValue(builder);
    builder.getQuery = jest.fn().mockReturnValue('(follow subquery)');
    builder.getRawMany = jest
      .fn()
      .mockResolvedValue([{ id: 2, username: 'Poster', avatar: null }]);
    expect(await service.suggestedUsers({ limit: 8 })).toEqual([
      { id: 2, username: 'Poster', avatar: null },
    ]);
    expect(builder.where).toHaveBeenCalledWith(
      '(post.roomId IS NULL OR room.isPublic = true)',
    );
    expect(builder.andWhere).not.toHaveBeenCalled();
    expect(builder.orderBy).toHaveBeenCalledWith('MAX(post.createdAt)', 'DESC');
    expect(builder.limit).toHaveBeenCalledWith(8);
    await service.suggestedUsers({ limit: 3 }, 1);
    expect(builder.andWhere).toHaveBeenCalledWith('author.id <> :viewerId', {
      viewerId: 1,
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'NOT EXISTS (follow subquery)',
    );
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
  it('accepts general posts and rejects invalid reactions', async () => {
    expect(
      await pipe.transform(
        { text: 'No movie yet', quotedPostId: 4 },
        { type: 'body', metatype: CreateCommunityPostDto },
      ),
    ).toMatchObject({ text: 'No movie yet', quotedPostId: 4 });
    await expect(
      pipe.transform(
        { text: 'x', quotedPostId: 0 },
        { type: 'body', metatype: CreateCommunityPostDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    for (const bad of [{ value: 0 }, { value: 2 }, { value: '1' }, {}])
      await expect(
        pipe.transform(bad, {
          type: 'body',
          metatype: CommunityReactionDto,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await pipe.transform(
        { value: -1 },
        { type: 'body', metatype: CommunityReactionDto },
      ),
    ).toMatchObject({ value: -1 });
  });
  it('defaults suggested users to 8 and caps them at 20', async () => {
    const metadata = {
      type: 'query' as const,
      metatype: CommunitySuggestedUsersDto,
    };
    expect(await pipe.transform({}, metadata)).toMatchObject({ limit: 8 });
    expect(await pipe.transform({ limit: '20' }, metadata)).toMatchObject({
      limit: 20,
    });
    for (const limit of ['0', '21', 'x'])
      await expect(pipe.transform({ limit }, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
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
