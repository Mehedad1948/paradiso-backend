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
import { UserFollow } from './user-follow.entity';
import {
  CommunityCommentDto,
  CommunityFeedDto,
  CommunityPageDto,
  CreateCommunityPostDto,
  UpdateCommunityPostDto,
} from './community.dto';

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
      ])
      .loadRelationCountAndMap('post.commentCount', 'post.comments');
  }

  private serializePost(post: CommunityPost & { commentCount?: number }) {
    const invite = post.promotedInvite;
    const canJoin =
      !!invite &&
      invite.isActive &&
      (!invite.expiresAt || invite.expiresAt > new Date()) &&
      (invite.maxUsage === 0 || invite.uses < invite.maxUsage);
    return {
      id: post.id,
      text: post.text,
      rating: post.rating,
      imageUrl: post.imageUrl ?? post.movie.poster_path ?? null,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: this.publicUser(post.author),
      movie: {
        id: post.movie.id,
        dbId: post.movie.dbId,
        title: post.movie.title,
        poster_path: post.movie.poster_path ?? null,
      },
      room: post.room ? { id: post.room.id, name: post.room.name } : null,
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
    return this.page(
      rows.map((post) => this.serializePost(post)),
      query.limit,
    );
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
    return this.serializePost(await this.readablePost(id, userId));
  }

  async createPost(dto: CreateCommunityPostDto, userId: number) {
    if (!(await this.movies.existsBy({ id: dto.movieId })))
      throw new NotFoundException('Movie not found');
    if (
      dto.roomId &&
      !(await this.roomAccess.checkUserRoomAccess(dto.roomId, userId))
    )
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
        movieId: dto.movieId,
        text: dto.text,
        rating: dto.rating,
        imageUrl: dto.imageUrl ?? null,
        roomId: dto.roomId ?? null,
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
    await this.posts.delete(id);
    return { message: 'Post deleted' };
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
