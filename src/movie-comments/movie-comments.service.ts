import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { ActiveUserData } from '../auth/interfaces/active-user-data.interface';
import { MovieComment } from './movie-comment.entity';
import {
  CreateMovieCommentDto,
  MovieCommentPageDto,
  MovieCommentRepliesPageDto,
  UpdateMovieCommentDto,
} from './movie-comments.dto';

// Per author across all movies: enough for a conversation, too few for a flood.
export const COMMENT_RATE_LIMIT = 5;
export const COMMENT_RATE_WINDOW_SECONDS = 60;

@Injectable()
export class MovieCommentsService {
  constructor(
    @InjectRepository(MovieComment)
    private readonly comments: Repository<MovieComment>,
    @InjectRepository(Movie) private readonly movies: Repository<Movie>,
  ) {}

  private commentQuery() {
    return this.comments
      .createQueryBuilder('comment')
      .leftJoin('comment.author', 'author')
      .select(['comment', 'author.id', 'author.username', 'author.avatar']);
  }

  private serialize(comment: MovieComment, replyCount = 0) {
    return {
      id: comment.id,
      movieId: comment.movieId,
      parentId: comment.parentId,
      text: comment.text,
      spoiler: comment.spoiler,
      author: {
        id: comment.author.id,
        username: comment.author.username,
        avatar: comment.author.avatar ?? null,
      },
      replyCount,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  // One grouped count for a whole page of top-level comments.
  private async replyCounts(ids: number[]) {
    if (!ids.length) return new Map<number, number>();
    const rows = await this.comments
      .createQueryBuilder('reply')
      .select('reply.parentId', 'parentId')
      .addSelect('COUNT(*)::int', 'count')
      .where('reply.parentId IN (:...ids)', { ids })
      .groupBy('reply.parentId')
      .getRawMany<{ parentId: number; count: number }>();
    return new Map(rows.map((row) => [row.parentId, row.count]));
  }

  // Query builder so the movie's eager relations are not joined.
  private async requireMovie(movieId: string) {
    const exists = await this.movies
      .createQueryBuilder('movie')
      .where('movie.id = :movieId', { movieId })
      .getExists();
    if (!exists) throw new NotFoundException('Movie not found');
  }

  private async requireComment(movieId: string, id: number) {
    const comment = await this.comments.findOneBy({ id, movieId });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  private async findOne(id: number) {
    const comment = await this.commentQuery()
      .where('comment.id = :id', { id })
      .getOneOrFail();
    const counts = comment.parentId ? null : await this.replyCounts([id]);
    return this.serialize(comment, counts?.get(id) ?? 0);
  }

  private async rateLimit(authorId: number) {
    const recent = await this.comments
      .createQueryBuilder('comment')
      .where('comment.authorId = :authorId', { authorId })
      .andWhere(
        `comment.createdAt > now() - interval '${COMMENT_RATE_WINDOW_SECONDS} seconds'`,
      )
      .getCount();
    if (recent >= COMMENT_RATE_LIMIT)
      throw new HttpException(
        'You are commenting too quickly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  // Top-level comments, newest first. The total counts replies too, so
  // clients can label the section without paging.
  async list(movieId: string, query: MovieCommentPageDto) {
    const builder = this.commentQuery()
      .where('comment.movieId = :movieId', { movieId })
      .andWhere('comment.parentId IS NULL');
    if (query.before)
      builder.andWhere('comment.id < :before', { before: query.before });
    const [rows, total] = await Promise.all([
      builder
        .orderBy('comment.id', 'DESC')
        .take(query.limit + 1)
        .getMany(),
      this.comments.countBy({ movieId }),
    ]);
    // Only an empty result needs to tell "no comments" from "no movie".
    if (!total) await this.requireMovie(movieId);
    const data = rows.slice(0, query.limit);
    const counts = await this.replyCounts(data.map((comment) => comment.id));
    return {
      data: data.map((comment) =>
        this.serialize(comment, counts.get(comment.id) ?? 0),
      ),
      nextCursor: rows.length > query.limit ? data[data.length - 1].id : null,
      total,
    };
  }

  // Oldest first, so a thread reads as a conversation.
  async listReplies(
    movieId: string,
    commentId: number,
    query: MovieCommentRepliesPageDto,
  ) {
    const parent = await this.requireComment(movieId, commentId);
    if (parent.parentId)
      throw new NotFoundException('Replies belong to top-level comments');
    const builder = this.commentQuery().where('comment.parentId = :commentId', {
      commentId,
    });
    if (query.after)
      builder.andWhere('comment.id > :after', { after: query.after });
    const rows = await builder
      .orderBy('comment.id', 'ASC')
      .take(query.limit + 1)
      .getMany();
    const data = rows.slice(0, query.limit);
    return {
      data: data.map((comment) => this.serialize(comment)),
      nextCursor: rows.length > query.limit ? data[data.length - 1].id : null,
    };
  }

  async create(movieId: string, dto: CreateMovieCommentDto, authorId: number) {
    let parentId: number | null = null;
    if (dto.parentId) {
      const parent = await this.requireComment(movieId, dto.parentId);
      parentId = parent.parentId ?? parent.id;
    } else {
      await this.requireMovie(movieId);
    }
    await this.rateLimit(authorId);
    const saved = await this.comments.save(
      this.comments.create({
        movieId,
        authorId,
        parentId,
        text: dto.text,
        spoiler: dto.spoiler ?? false,
      }),
    );
    return this.findOne(saved.id);
  }

  async update(
    movieId: string,
    id: number,
    dto: UpdateMovieCommentDto,
    userId: number,
  ) {
    const comment = await this.requireComment(movieId, id);
    if (comment.authorId !== userId)
      throw new ForbiddenException('Only the author can edit this comment');
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length) await this.comments.update(id, changes);
    return this.findOne(id);
  }

  // Authors remove their own words; admins moderate everyone's. Deleting a
  // top-level comment removes its replies.
  async remove(movieId: string, id: number, user: ActiveUserData) {
    const comment = await this.requireComment(movieId, id);
    if (comment.authorId !== user.sub && user.role !== 'admin')
      throw new ForbiddenException('You cannot delete this comment');
    await this.comments.delete({ id, movieId });
    return { message: 'Comment deleted' };
  }
}
