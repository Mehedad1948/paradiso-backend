import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';
import { RoomInviteLink } from '../room-invite-links/room-invite-link.entity';
import { RoomAccessService } from '../rooms/providers/room-access.service';
import { CommunityPost } from './community-post.entity';
import { CommunityComment } from './community-comment.entity';
import { CommunityPostReaction } from './community-post-reaction.entity';
import { UserFollow } from './user-follow.entity';
import {
  CommunityCommentDto,
  CommunityFeedDto,
  CommunityPageDto,
  CreateCommunityPostDto,
  UpdateCommunityPostDto,
} from './community.dto';

interface PostEngagement {
  likeCount: number;
  dislikeCount: number;
  repostCount: number;
  quoteCount: number;
  myReaction: 1 | -1 | null;
  reposted: boolean;
}

@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(CommunityPost)
    private readonly posts: Repository<CommunityPost>,
    @InjectRepository(CommunityComment)
    private readonly comments: Repository<CommunityComment>,
    @InjectRepository(UserFollow)
    private readonly follows: Repository<UserFollow>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Movie) private readonly movies: Repository<Movie>,
    @InjectRepository(RoomInviteLink)
    private readonly invites: Repository<RoomInviteLink>,
    private readonly roomAccess: RoomAccessService,
    @InjectRepository(CommunityPostReaction)
    private readonly reactions: Repository<CommunityPostReaction>,
  ) {}

  private publicUser(user: User) {
    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar ?? null,
    };
  }

  private postQuery() {
    return this.posts
      .createQueryBuilder('post')
      .leftJoin('post.author', 'author')
      .leftJoin('post.movie', 'movie')
      .leftJoin('post.room', 'room')
      .leftJoin('post.promotedInvite', 'invite')
      .leftJoin('invite.room', 'promotedRoom')
      .leftJoin('post.quotedPost', 'quoted')
      .leftJoin('quoted.author', 'quotedAuthor')
      .leftJoin('quoted.movie', 'quotedMovie')
      .select([
        'post',
        'author.id',
        'author.username',
        'author.avatar',
        'movie.id',
        'movie.title',
        'movie.poster_path',
        'movie.dbId',
        'room.id',
        'room.name',
        'room.isPublic',
        'invite.id',
        'invite.token',
        'invite.isActive',
        'invite.expiresAt',
        'invite.maxUsage',
        'invite.uses',
        'promotedRoom.id',
        'promotedRoom.name',
        'promotedRoom.image',
        'quoted.id',
        'quoted.text',
        'quoted.rating',
        'quoted.imageUrl',
        'quoted.createdAt',
        'quotedAuthor.id',
        'quotedAuthor.username',
        'quotedAuthor.avatar',
        'quotedMovie.id',
        'quotedMovie.title',
        'quotedMovie.poster_path',
        'quotedMovie.dbId',
      ])
      .loadRelationCountAndMap('post.commentCount', 'post.comments');
  }

  private serializeMovie(movie: Movie | null) {
    return movie
      ? {
          id: movie.id,
          dbId: movie.dbId,
          title: movie.title,
          poster_path: movie.poster_path ?? null,
        }
      : null;
  }

  // Like/dislike/repost/quote counts and the viewer's own state, per post.
  private async engagement(ids: number[], userId?: number) {
    const stats = new Map<number, PostEngagement>();
    if (ids.length === 0) return stats;
    const rows = (await this.reactions.query(
      `SELECT p.id,
        (SELECT count(*) FROM community_post_reaction r WHERE r."postId" = p.id AND r.value = 1)::int AS "likeCount",
        (SELECT count(*) FROM community_post_reaction r WHERE r."postId" = p.id AND r.value = -1)::int AS "dislikeCount",
        (SELECT r.value FROM community_post_reaction r WHERE r."postId" = p.id AND r."userId" = $2::int) AS "myReaction",
        (SELECT count(*) FROM community_post q WHERE q."quotedPostId" = p.id AND q.text = '')::int AS "repostCount",
        (SELECT count(*) FROM community_post q WHERE q."quotedPostId" = p.id AND q.text <> '')::int AS "quoteCount",
        EXISTS (SELECT 1 FROM community_post q WHERE q."quotedPostId" = p.id AND q.text = '' AND q."authorId" = $2::int) AS "reposted"
       FROM community_post p WHERE p.id = ANY($1::int[])`,
      [ids, userId ?? null],
    )) as (PostEngagement & { id: number })[];
    for (const row of rows) stats.set(row.id, row);
    return stats;
  }

  private async serializePosts(
    posts: (CommunityPost & { commentCount?: number })[],
    userId?: number,
  ) {
    const stats = await this.engagement(
      posts.map((post) => post.id),
      userId,
    );
    return posts.map((post) => this.serializePost(post, stats.get(post.id)));
  }

  private serializePost(
    post: CommunityPost & { commentCount?: number },
    stats?: PostEngagement,
  ) {
    const invite = post.promotedInvite;
    const canJoin =
      !!invite &&
      invite.isActive &&
      (!invite.expiresAt || invite.expiresAt > new Date()) &&
      (invite.maxUsage === 0 || invite.uses < invite.maxUsage);
    const quoted = post.quotedPost;
    const isRepost = post.text === '' && !!post.quotedPostId;
    return {
      id: post.id,
      kind: isRepost ? 'repost' : post.quotedPostId ? 'quote' : 'post',
      text: post.text,
      rating: post.rating ?? null,
      imageUrl: post.imageUrl ?? post.movie?.poster_path ?? null,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: this.publicUser(post.author),
      movie: this.serializeMovie(post.movie),
      room: post.room ? { id: post.room.id, name: post.room.name } : null,
      quotedPostId: post.quotedPostId ?? null,
      quotedPost: quoted
        ? {
            id: quoted.id,
            text: quoted.text,
            rating: quoted.rating ?? null,
            imageUrl: quoted.imageUrl ?? quoted.movie?.poster_path ?? null,
            createdAt: quoted.createdAt,
            author: this.publicUser(quoted.author),
            movie: this.serializeMovie(quoted.movie),
          }
        : null,
      promotion: invite
        ? {
            room: {
              id: invite.room.id,
              name: invite.room.name,
              image: invite.room.image ?? null,
            },
            canJoin,
            token: canJoin ? invite.token : null,
          }
        : null,
      commentCount: post.commentCount ?? 0,
      likeCount: stats?.likeCount ?? 0,
      dislikeCount: stats?.dislikeCount ?? 0,
      repostCount: stats?.repostCount ?? 0,
      quoteCount: stats?.quoteCount ?? 0,
      myReaction: stats?.myReaction ?? null,
      reposted: stats?.reposted ?? false,
    };
  }

  private page<T extends { id: number }>(rows: T[], limit: number) {
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async feed(
    query: CommunityFeedDto,
    userId?: number,
    roomId?: number,
    following = false,
  ) {
    if (
      roomId !== undefined &&
      !(await this.roomAccess.canRead(roomId, userId ?? 0))
    )
      throw new ForbiddenException('You cannot access this room');
    const builder = this.postQuery();
    if (roomId !== undefined)
      builder.where('post.roomId = :roomId', { roomId });
    else builder.where('(post.roomId IS NULL OR room.isPublic = true)');
    if (query.authorId)
      builder.andWhere('post.authorId = :authorId', {
        authorId: query.authorId,
      });
    if (query.movieId)
      builder.andWhere('post.movieId = :movieId', { movieId: query.movieId });
    if (following) {
      builder.andWhere(
        'post.authorId IN ' +
          builder
            .subQuery()
            .select('follow.followingId')
            .from(UserFollow, 'follow')
            .where('follow.followerId = :viewerId')
            .getQuery(),
        { viewerId: userId },
      );
    }
    if (query.before)
      builder.andWhere('post.id < :before', { before: query.before });
    const rows = await builder
      .orderBy('post.id', 'DESC')
      .take(query.limit + 1)
      .getMany();
    return this.page(await this.serializePosts(rows, userId), query.limit);
  }

  private async readablePost(id: number, userId?: number) {
    const post = await this.postQuery().where('post.id = :id', { id }).getOne();
    if (!post) throw new NotFoundException('Post not found');
    if (
      post.roomId &&
      !(await this.roomAccess.canRead(post.roomId, userId ?? 0))
    )
      throw new NotFoundException('Post not found');
    return post;
  }

  async getPost(id: number, userId?: number) {
    const [post] = await this.serializePosts(
      [await this.readablePost(id, userId)],
      userId,
    );
    return post;
  }

  // A repost of a repost points at the original post instead.
  private async quoteTarget(id: number, userId: number) {
    const post = await this.readablePost(id, userId);
    if (post.text === '' && post.quotedPostId)
      return this.readablePost(post.quotedPostId, userId);
    return post;
  }

  async createPost(dto: CreateCommunityPostDto, userId: number) {
    if (dto.movieId && !(await this.movies.existsBy({ id: dto.movieId })))
      throw new NotFoundException('Movie not found');
    if (dto.rating !== undefined && !dto.movieId)
      throw new BadRequestException('A rating requires a movie');
    let roomId = dto.roomId ?? null;
    let quotedPostId: number | null = null;
    if (dto.quotedPostId) {
      const quoted = await this.quoteTarget(dto.quotedPostId, userId);
      quotedPostId = quoted.id;
      // A quote of a private room post stays inside that room.
      if (quoted.roomId && quoted.room && !quoted.room.isPublic) {
        if (roomId !== null && roomId !== quoted.roomId)
          throw new BadRequestException(
            'Posts quoting a private room post must stay in that room',
          );
        roomId = quoted.roomId;
      }
    }
    if (roomId && !(await this.roomAccess.checkUserRoomAccess(roomId, userId)))
      throw new ForbiddenException('Join the room before posting');
    let promotedInviteId: number | null = null;
    if (dto.promotedInviteToken) {
      const invite = await this.invites.findOne({
        where: { token: dto.promotedInviteToken },
        relations: ['room'],
      });
      if (!invite) throw new NotFoundException('Invite link not found');
      await this.roomAccess.requireOwner(invite.room.id, userId);
      if (
        !invite.isActive ||
        (invite.expiresAt && invite.expiresAt <= new Date()) ||
        (invite.maxUsage > 0 && invite.uses >= invite.maxUsage)
      )
        throw new BadRequestException('Invite link is unavailable');
      promotedInviteId = invite.id;
    }
    const post = await this.posts.save(
      this.posts.create({
        authorId: userId,
        movieId: dto.movieId ?? null,
        text: dto.text,
        rating: dto.rating ?? null,
        imageUrl: dto.imageUrl ?? null,
        quotedPostId,
        roomId,
        promotedInviteId,
      }),
    );
    return this.getPost(post.id, userId);
  }

  async updatePost(id: number, dto: UpdateCommunityPostDto, userId: number) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException(
        'Provide at least one post field to update',
      );
    const post = await this.readablePost(id, userId);
    if (post.authorId !== userId)
      throw new ForbiddenException('Only the author can edit this post');
    if (post.text === '' && post.quotedPostId)
      throw new BadRequestException(
        'Reposts cannot be edited; quote the post instead',
      );
    if (dto.rating !== undefined && !post.movieId)
      throw new BadRequestException('A rating requires a movie');
    await this.posts.update({ id, authorId: userId }, dto);
    return this.getPost(id, userId);
  }

  async deletePost(id: number, userId: number) {
    const post = await this.readablePost(id, userId);
    if (post.authorId !== userId) {
      if (!post.roomId)
        throw new ForbiddenException('Only the author can delete this post');
      await this.roomAccess.requireOwner(post.roomId, userId);
    }
    // Plain reposts have nothing of their own to show once the original is gone.
    await this.posts.delete({ quotedPostId: id, text: '' });
    await this.posts.delete(id);
    return { message: 'Post deleted' };
  }

  async repost(id: number, userId: number) {
    const target = await this.quoteTarget(id, userId);
    const roomId =
      target.roomId && target.room && !target.room.isPublic
        ? target.roomId
        : null;
    if (roomId && !(await this.roomAccess.checkUserRoomAccess(roomId, userId)))
      throw new ForbiddenException('Join the room before reposting');
    const existing = () =>
      this.posts.findOneBy({
        authorId: userId,
        quotedPostId: target.id,
        text: '',
      });
    let repost = await existing();
    if (!repost) {
      try {
        repost = await this.posts.save(
          this.posts.create({
            authorId: userId,
            movieId: null,
            text: '',
            rating: null,
            imageUrl: null,
            quotedPostId: target.id,
            roomId,
          }),
        );
      } catch (error) {
        // A concurrent request already reposted it.
        if ((error as { code?: string }).code !== '23505') throw error;
        repost = await existing();
      }
    }
    return this.getPost(repost!.id, userId);
  }

  async undoRepost(id: number, userId: number) {
    await this.posts.delete({ authorId: userId, quotedPostId: id, text: '' });
    return { message: 'Repost removed' };
  }

  private async reactionSummary(postId: number, userId: number) {
    const stats = (await this.engagement([postId], userId)).get(postId);
    return {
      likeCount: stats?.likeCount ?? 0,
      dislikeCount: stats?.dislikeCount ?? 0,
      myReaction: stats?.myReaction ?? null,
    };
  }

  private async requireReactable(id: number, userId: number) {
    const post = await this.readablePost(id, userId);
    if (
      post.roomId &&
      !(await this.roomAccess.checkUserRoomAccess(post.roomId, userId))
    )
      throw new ForbiddenException('Join the room before reacting');
  }

  async react(postId: number, value: 1 | -1, userId: number) {
    await this.requireReactable(postId, userId);
    await this.reactions.upsert({ postId, userId, value }, [
      'postId',
      'userId',
    ]);
    return this.reactionSummary(postId, userId);
  }

  async removeReaction(postId: number, userId: number) {
    await this.requireReactable(postId, userId);
    await this.reactions.delete({ postId, userId });
    return this.reactionSummary(postId, userId);
  }

  private commentQuery() {
    return this.comments
      .createQueryBuilder('comment')
      .leftJoin('comment.author', 'author')
      .select(['comment', 'author.id', 'author.username', 'author.avatar']);
  }

  private serializeComment(comment: CommunityComment) {
    return {
      id: comment.id,
      postId: comment.postId,
      text: comment.text,
      author: this.publicUser(comment.author),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  async listComments(postId: number, query: CommunityPageDto, userId?: number) {
    await this.readablePost(postId, userId);
    const builder = this.commentQuery().where('comment.postId = :postId', {
      postId,
    });
    if (query.before)
      builder.andWhere('comment.id < :before', { before: query.before });
    const rows = await builder
      .orderBy('comment.id', 'DESC')
      .take(query.limit + 1)
      .getMany();
    return this.page(
      rows.map((comment) => this.serializeComment(comment)),
      query.limit,
    );
  }

  async createComment(
    postId: number,
    dto: CommunityCommentDto,
    userId: number,
  ) {
    const post = await this.readablePost(postId, userId);
    if (
      post.roomId &&
      !(await this.roomAccess.checkUserRoomAccess(post.roomId, userId))
    )
      throw new ForbiddenException('Join the room before commenting');
    const comment = await this.comments.save(
      this.comments.create({ postId, authorId: userId, text: dto.text }),
    );
    return this.serializeComment(
      await this.commentQuery()
        .where('comment.id = :id', { id: comment.id })
        .getOneOrFail(),
    );
  }

  async deleteComment(postId: number, id: number, userId: number) {
    const post = await this.readablePost(postId, userId);
    const comment = await this.comments.findOneBy({ id, postId });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId && post.authorId !== userId) {
      if (!post.roomId)
        throw new ForbiddenException('You cannot delete this comment');
      await this.roomAccess.requireOwner(post.roomId, userId);
    }
    await this.comments.delete({ id, postId });
    return { message: 'Comment deleted' };
  }

  private async requireUser(id: number) {
    const user = await this.users.findOne({
      where: { id },
      select: { id: true, username: true, avatar: true },
      loadEagerRelations: false,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async profile(id: number) {
    const user = await this.requireUser(id);
    const [followersCount, followingCount] = await Promise.all([
      this.follows.countBy({ followingId: id }),
      this.follows.countBy({ followerId: id }),
    ]);
    return { ...this.publicUser(user), followersCount, followingCount };
  }

  async follow(id: number, userId: number) {
    if (id === userId)
      throw new BadRequestException('You cannot follow yourself');
    await this.requireUser(id);
    await this.follows
      .createQueryBuilder()
      .insert()
      .values({ followerId: userId, followingId: id })
      .orIgnore()
      .execute();
    return { message: 'Following user' };
  }

  async unfollow(id: number, userId: number) {
    await this.follows.delete({ followerId: userId, followingId: id });
    return { message: 'Unfollowed user' };
  }

  async listFollows(id: number, query: CommunityPageDto, followers: boolean) {
    await this.requireUser(id);
    const relation = followers ? 'follower' : 'following';
    const column = followers ? 'followingId' : 'followerId';
    const builder = this.follows
      .createQueryBuilder('follow')
      .innerJoin('follow.' + relation, 'user')
      .select(['follow', 'user.id', 'user.username', 'user.avatar'])
      .where(`follow.${column} = :id`, { id });
    if (query.before)
      builder.andWhere('user.id < :before', { before: query.before });
    const rows = await builder
      .orderBy('user.id', 'DESC')
      .take(query.limit + 1)
      .getMany();
    return this.page(
      rows.map((row) => this.publicUser(row[relation])),
      query.limit,
    );
  }
}
