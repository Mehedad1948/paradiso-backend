import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, LessThan, Repository } from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { MovieDbService } from '../movies/providers/MovieDb.serviec';
import { ContentBlocksService } from '../movies/providers/content-blocks.service';
import { isAdultContent } from '../movies/content-filter';
import { Room } from '../rooms/room.entity';
import { User } from '../users/user.entity';
import {
  excerpt,
  NotificationsService,
} from '../notifications/notifications.service';
import {
  RoomChatRead,
  RoomMessage,
  RoomMessageMention,
  RoomMessageMovie,
  RoomMessageReaction,
} from './room-message.entity';
import { RoomPoll, RoomPollOption, RoomPollVote } from './room-poll.entity';
import {
  ChatMovieMentionDto,
  ChatPageDto,
  ChatPollOptionDto,
  ChatPollVoteDto,
  ChatSyncDto,
  CreateChatMessageDto,
  UpdateChatMessageDto,
} from './room-chat.dto';

// Sync cursors trail the database clock so changes from transactions that
// started before a poll but committed after it are still picked up.
const SYNC_OVERLAP_MS = 5000;
const RATE_LIMIT_MESSAGES = 10;
const RATE_LIMIT_SECONDS = 10;
const REPLY_PREVIEW_LENGTH = 200;
const PINNED_LIMIT = 50;
const MAX_POLL_DAYS = 30;

type MovieCard = Pick<
  RoomMessageMovie,
  'movieId' | 'tmdbId' | 'title' | 'year' | 'posterPath'
>;

const yearOf = (date?: string | null) =>
  date && /^\d{4}/.test(date) ? date.slice(0, 4) : null;

@Injectable()
export class RoomChatService {
  constructor(
    @InjectRepository(RoomMessage)
    private readonly messages: Repository<RoomMessage>,
    private readonly movieDb: MovieDbService,
    private readonly notifications: NotificationsService,
    private readonly contentBlocks: ContentBlocksService,
  ) {}

  private get manager() {
    return this.messages.manager;
  }

  private publicUser(user?: User | null) {
    return user
      ? { id: user.id, username: user.username, avatar: user.avatar ?? null }
      : null;
  }

  private messageQuery() {
    return this.messages
      .createQueryBuilder('message')
      .leftJoin('message.author', 'author')
      .leftJoin('message.replyTo', 'reply')
      .leftJoin('reply.author', 'replyAuthor')
      .select([
        'message',
        'author.id',
        'author.username',
        'author.avatar',
        'reply.id',
        'reply.text',
        'reply.deletedAt',
        'replyAuthor.id',
        'replyAuthor.username',
        'replyAuthor.avatar',
      ]);
  }

  // Load mentions, movie cards, reactions and polls for a page in bulk.
  private async serialize(rows: RoomMessage[], viewerId: number) {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [mentions, movies, reactions, polls, options, votes] =
      await Promise.all([
        this.manager
          .getRepository(RoomMessageMention)
          .createQueryBuilder('mention')
          .innerJoin('mention.user', 'user')
          .select([
            'mention.messageId',
            'mention.userId',
            'user.id',
            'user.username',
            'user.avatar',
          ])
          .where('mention.messageId IN (:...ids)', { ids })
          .getMany(),
        this.manager.getRepository(RoomMessageMovie).find({
          where: { messageId: In(ids) },
          order: { position: 'ASC' },
        }),
        this.manager
          .getRepository(RoomMessageReaction)
          .createQueryBuilder('reaction')
          .select('reaction.messageId', 'messageId')
          .addSelect('reaction.emoji', 'emoji')
          .addSelect('COUNT(*)::int', 'count')
          .addSelect(
            'ARRAY_AGG(reaction.userId ORDER BY reaction.createdAt)',
            'userIds',
          )
          .addSelect('MIN(reaction.createdAt)', 'firstAt')
          .where('reaction.messageId IN (:...ids)', { ids })
          .groupBy('reaction.messageId')
          .addGroupBy('reaction.emoji')
          .orderBy('"firstAt"', 'ASC')
          .getRawMany<{
            messageId: number;
            emoji: string;
            count: number;
            userIds: number[];
          }>(),
        this.manager.getRepository(RoomPoll).findBy({ messageId: In(ids) }),
        this.manager.getRepository(RoomPollOption).find({
          where: { messageId: In(ids) },
          order: { position: 'ASC' },
        }),
        this.manager.getRepository(RoomPollVote).find({
          where: { messageId: In(ids) },
          select: { optionId: true, userId: true, messageId: true },
          order: { createdAt: 'ASC' },
        }),
      ]);
    const group = <T>(items: T[], key: (item: T) => number) => {
      const map = new Map<number, T[]>();
      for (const item of items) {
        const list = map.get(key(item)) ?? [];
        list.push(item);
        map.set(key(item), list);
      }
      return map;
    };
    const mentionsBy = group(mentions, (item) => item.messageId);
    const moviesBy = group(movies, (item) => item.messageId);
    const reactionsBy = group(reactions, (item) => item.messageId);
    const optionsBy = group(options, (item) => item.messageId);
    const votesBy = group(votes, (item) => item.optionId);
    const pollVotersBy = group(votes, (item) => item.messageId);
    const pollBy = new Map(polls.map((poll) => [poll.messageId, poll]));
    const now = Date.now();
    return rows.map((message) => {
      const deleted = !!message.deletedAt;
      const poll = deleted ? undefined : pollBy.get(message.id);
      return {
        id: message.id,
        roomId: message.roomId,
        text: deleted ? null : message.text,
        author: this.publicUser(message.author),
        replyTo: message.replyTo
          ? {
              id: message.replyTo.id,
              text: message.replyTo.deletedAt
                ? null
                : (message.replyTo.text?.slice(0, REPLY_PREVIEW_LENGTH) ??
                  null),
              author: this.publicUser(message.replyTo.author),
              deleted: !!message.replyTo.deletedAt,
            }
          : null,
        mentions: deleted
          ? []
          : (mentionsBy.get(message.id) ?? []).map(
              (mention) => this.publicUser(mention.user)!,
            ),
        movies: deleted
          ? []
          : (moviesBy.get(message.id) ?? []).map((movie) => ({
              movieId: movie.movieId,
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              posterPath: movie.posterPath,
            })),
        reactions: deleted
          ? []
          : (reactionsBy.get(message.id) ?? []).map((reaction) => ({
              emoji: reaction.emoji,
              count: reaction.count,
              reactedByMe: reaction.userIds.includes(viewerId),
              userIds: reaction.userIds,
            })),
        poll: poll
          ? {
              allowsMultiple: poll.allowsMultiple,
              anonymous: poll.anonymous,
              closesAt: poll.closesAt,
              closedAt: poll.closedAt,
              isClosed: this.isClosed(poll, now),
              totalVoters: new Set(
                (pollVotersBy.get(message.id) ?? []).map((vote) => vote.userId),
              ).size,
              options: (optionsBy.get(message.id) ?? []).map((option) => {
                const voters = (votesBy.get(option.id) ?? []).map(
                  (vote) => vote.userId,
                );
                return {
                  id: option.id,
                  text: option.text,
                  movieId: option.movieId,
                  votes: voters.length,
                  votedByMe: voters.includes(viewerId),
                  voterIds: poll.anonymous ? [] : voters,
                };
              }),
            }
          : null,
        pinnedAt: deleted ? null : message.pinnedAt,
        pinnedById: deleted ? null : message.pinnedById,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      };
    });
  }

  private isClosed(poll: RoomPoll, now = Date.now()) {
    return (
      !!poll.closedAt || (!!poll.closesAt && poll.closesAt.getTime() <= now)
    );
  }

  // Every visible change bumps updatedAt so /sync returns the message again.
  private touch(manager: EntityManager, id: number) {
    return manager
      .createQueryBuilder()
      .update(RoomMessage)
      .set({ updatedAt: () => 'now()' })
      .where('id = :id', { id })
      .execute();
  }

  private async findMessage(roomId: number, id: number) {
    const message = await this.messages.findOneBy({ id, roomId });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  private async findActiveMessage(roomId: number, id: number) {
    const message = await this.findMessage(roomId, id);
    if (message.deletedAt)
      throw new BadRequestException('This message was deleted');
    return message;
  }

  private async isRoomOwner(roomId: number, userId: number) {
    const room = await this.manager
      .getRepository(Room)
      .createQueryBuilder('room')
      .leftJoin('room.owner', 'owner')
      .select(['room.id', 'owner.id'])
      .where('room.id = :roomId', { roomId })
      .getOne();
    return room?.owner?.id === userId;
  }

  private async requireAuthorOrOwner(
    message: RoomMessage,
    userId: number,
    action: string,
  ) {
    if (
      message.authorId !== userId &&
      !(await this.isRoomOwner(message.roomId, userId))
    )
      throw new ForbiddenException(
        `Only the author or the room owner can ${action} this message`,
      );
  }

  private async memberIds(roomId: number, ids: number[]) {
    if (!ids.length) return [];
    const room = await this.manager
      .getRepository(Room)
      .createQueryBuilder('room')
      .leftJoin('room.users', 'member', 'member.id IN (:...ids)', { ids })
      .leftJoin('room.owner', 'owner')
      .select(['room.id', 'member.id', 'owner.id'])
      .where('room.id = :roomId', { roomId })
      .getOne();
    const allowed = new Set((room?.users ?? []).map((user) => user.id));
    if (room?.owner) allowed.add(room.owner.id);
    if (ids.some((id) => !allowed.has(id)))
      throw new BadRequestException('Mentioned users must be room members');
    return ids;
  }

  // Mentioned users and the author of the message replied to. Only current
  // members are notified, so someone who left never sees the chat again.
  private async notifyMentions(
    manager: EntityManager,
    message: Pick<RoomMessage, 'id' | 'roomId' | 'authorId' | 'text'>,
    mentionIds: number[],
    replyAuthorId?: number,
  ) {
    const reasons = new Map<number, 'mention' | 'reply'>();
    for (const id of mentionIds) reasons.set(id, 'mention');
    if (replyAuthorId && !reasons.has(replyAuthorId))
      reasons.set(replyAuthorId, 'reply');
    reasons.delete(message.authorId);
    if (!reasons.size) return;
    const room = await manager
      .getRepository(Room)
      .createQueryBuilder('room')
      .leftJoin('room.users', 'member', 'member.id IN (:...ids)', {
        ids: [...reasons.keys()],
      })
      .leftJoin('room.owner', 'owner')
      .select(['room.id', 'room.name', 'member.id', 'owner.id'])
      .where('room.id = :roomId', { roomId: message.roomId })
      .getOneOrFail();
    const members = new Set(room.users.map((user) => user.id));
    if (room.owner) members.add(room.owner.id);
    await this.notifications.notify(
      [...reasons]
        .filter(([recipientId]) => members.has(recipientId))
        .map(([recipientId, reason]) => ({
          type: 'chat_mention' as const,
          recipientId,
          actorId: message.authorId,
          entityType: 'message' as const,
          entityId: message.id,
          roomId: message.roomId,
          data: {
            roomName: room.name,
            messageExcerpt: excerpt(message.text),
            reason,
          },
        })),
      manager,
    );
  }

  private async roomMovies(roomId: number, ids: string[]) {
    if (!ids.length) return new Map<string, Movie>();
    const movies = await this.manager
      .getRepository(Movie)
      .createQueryBuilder('movie')
      .innerJoin('movie.rooms', 'room', 'room.id = :roomId', { roomId })
      .select([
        'movie.id',
        'movie.dbId',
        'movie.title',
        'movie.release_date',
        'movie.poster_path',
      ])
      .where('movie.id IN (:...ids)', { ids: [...new Set(ids)] })
      .getMany();
    const byId = new Map(movies.map((movie) => [movie.id, movie]));
    if (ids.some((id) => !byId.has(id)))
      throw new BadRequestException('Movies must be in this room');
    return byId;
  }

  private card(movie: Movie, inRoom: boolean): MovieCard {
    return {
      movieId: inRoom ? movie.id : null,
      tmdbId: movie.dbId,
      title: movie.title.slice(0, 255),
      year: yearOf(movie.release_date),
      posterPath: movie.poster_path?.slice(0, 255) ?? null,
    };
  }

  // Room movies link to the room's copy. TMDb movies that are already in the
  // room link there too; others are snapshotted from the catalogue.
  private async resolveMovies(roomId: number, mentions: ChatMovieMentionDto[]) {
    for (const mention of mentions) {
      if ((mention.movieId === undefined) === (mention.tmdbId === undefined))
        throw new BadRequestException(
          'Each movie needs exactly one of movieId or tmdbId',
        );
    }
    const local = await this.roomMovies(
      roomId,
      mentions.flatMap((mention) => mention.movieId ?? []),
    );
    const tmdbIds = [
      ...new Set(mentions.flatMap((mention) => mention.tmdbId ?? [])),
    ];
    const known = tmdbIds.length
      ? await this.manager
          .getRepository(Movie)
          .createQueryBuilder('movie')
          .leftJoin('movie.rooms', 'room', 'room.id = :roomId', { roomId })
          .select([
            'movie.id',
            'movie.dbId',
            'movie.title',
            'movie.release_date',
            'movie.poster_path',
            'room.id',
          ])
          .where('movie.dbId IN (:...tmdbIds)', { tmdbIds })
          .getMany()
      : [];
    const cards = new Map<number, MovieCard>(
      known.map((movie) => [
        movie.dbId!,
        this.card(movie, !!movie.rooms?.length),
      ]),
    );
    const unknown = tmdbIds.filter((id) => !cards.has(id));
    if ((await this.contentBlocks.blocked('movie', unknown)).size)
      throw new UnprocessableEntityException('This title is not available');
    const fetched = await Promise.all(
      unknown.map((id) => this.movieDb.getMovieDetails(id)),
    );
    if (fetched.some(isAdultContent))
      throw new UnprocessableEntityException('This title is not available');
    for (const movie of fetched)
      cards.set(movie.id, {
        movieId: null,
        tmdbId: movie.id,
        title: (movie.title ?? 'Untitled').slice(0, 255),
        year: yearOf(movie.release_date),
        posterPath: movie.poster_path?.slice(0, 255) ?? null,
      });
    return mentions.map((mention) =>
      mention.movieId
        ? this.card(local.get(mention.movieId)!, true)
        : cards.get(mention.tmdbId!)!,
    );
  }

  private async resolvePollOptions(
    roomId: number,
    options: ChatPollOptionDto[],
  ) {
    const movies = await this.roomMovies(
      roomId,
      options.flatMap((option) => option.movieId ?? []),
    );
    return options.map((option) => {
      const movie = option.movieId ? movies.get(option.movieId) : undefined;
      const text = option.text ?? movie?.title.slice(0, 100);
      if (!text)
        throw new BadRequestException('Each poll option needs text or a movie');
      return { text, movieId: option.movieId ?? null };
    });
  }

  private async rateLimit(roomId: number, userId: number) {
    const recent = await this.messages
      .createQueryBuilder('message')
      .where('message.authorId = :userId', { userId })
      .andWhere('message.roomId = :roomId', { roomId })
      .andWhere(
        `message.createdAt > now() - interval '${RATE_LIMIT_SECONDS} seconds'`,
      )
      .getCount();
    if (recent >= RATE_LIMIT_MESSAGES)
      throw new HttpException(
        'You are sending messages too quickly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  async listMessages(roomId: number, userId: number, query: ChatPageDto) {
    const builder = this.messageQuery().where('message.roomId = :roomId', {
      roomId,
    });
    if (query.before)
      builder.andWhere('message.id < :before', { before: query.before });
    const rows = await builder
      .orderBy('message.id', 'DESC')
      .limit(query.limit + 1)
      .getMany();
    const page = rows.slice(0, query.limit);
    return {
      data: await this.serialize(page, userId),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }

  async syncMessages(roomId: number, userId: number, query: ChatSyncDto) {
    const [{ now }] = await this.manager.query<{ now: Date }[]>(
      'SELECT now() AS now',
    );
    const rows = await this.messageQuery()
      .where('message.roomId = :roomId', { roomId })
      .andWhere('message.updatedAt > :since', { since: query.since })
      .orderBy('message.updatedAt', 'ASC')
      .addOrderBy('message.id', 'ASC')
      .limit(query.limit + 1)
      .getMany();
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    // JS dates drop microseconds; stepping back 1 ms re-sends a few rows
    // instead of skipping ones that share the last timestamp.
    const cursor = hasMore
      ? new Date(page[page.length - 1].updatedAt.getTime() - 1)
      : new Date(new Date(now).getTime() - SYNC_OVERLAP_MS);
    return {
      data: await this.serialize(page, userId),
      cursor: cursor.toISOString(),
      hasMore,
    };
  }

  async getMessage(roomId: number, id: number, userId: number) {
    const message = await this.messageQuery()
      .where('message.id = :id', { id })
      .andWhere('message.roomId = :roomId', { roomId })
      .getOne();
    if (!message) throw new NotFoundException('Message not found');
    return (await this.serialize([message], userId))[0];
  }

  async listPinned(roomId: number, userId: number) {
    const rows = await this.messageQuery()
      .where('message.roomId = :roomId', { roomId })
      .andWhere('message.pinnedAt IS NOT NULL')
      .andWhere('message.deletedAt IS NULL')
      .orderBy('message.pinnedAt', 'DESC')
      .limit(PINNED_LIMIT)
      .getMany();
    return this.serialize(rows, userId);
  }

  async sendMessage(roomId: number, userId: number, dto: CreateChatMessageDto) {
    const movieMentions = dto.movies ?? [];
    if (!dto.text && !movieMentions.length && !dto.poll)
      throw new BadRequestException('A message needs text, a movie or a poll');
    if (dto.poll && !dto.text)
      throw new BadRequestException('A poll needs its question as text');
    if (dto.poll?.closesAt) {
      const closesAt = dto.poll.closesAt.getTime();
      if (
        closesAt <= Date.now() ||
        closesAt > Date.now() + MAX_POLL_DAYS * 86_400_000
      )
        throw new BadRequestException(
          `closesAt must be in the next ${MAX_POLL_DAYS} days`,
        );
    }
    await this.rateLimit(roomId, userId);
    const replyTo = dto.replyToId
      ? await this.findActiveMessage(roomId, dto.replyToId)
      : null;
    const mentionIds = await this.memberIds(roomId, dto.mentionedUserIds ?? []);
    // Resolve TMDb cards before opening the transaction.
    const movies = await this.resolveMovies(roomId, movieMentions);
    const pollOptions = dto.poll
      ? await this.resolvePollOptions(roomId, dto.poll.options)
      : [];
    const id = await this.manager.transaction(async (manager) => {
      const repository = manager.getRepository(RoomMessage);
      const message = await repository.save(
        repository.create({
          roomId,
          authorId: userId,
          text: dto.text ?? null,
          replyToId: dto.replyToId ?? null,
        }),
      );
      if (mentionIds.length)
        await manager.getRepository(RoomMessageMention).insert(
          mentionIds.map((mentioned) => ({
            messageId: message.id,
            userId: mentioned,
          })),
        );
      if (movies.length)
        await manager.getRepository(RoomMessageMovie).insert(
          movies.map((movie, position) => ({
            ...movie,
            messageId: message.id,
            position,
          })),
        );
      if (dto.poll) {
        await manager.getRepository(RoomPoll).insert({
          messageId: message.id,
          allowsMultiple: dto.poll.allowsMultiple ?? false,
          anonymous: dto.poll.anonymous ?? false,
          closesAt: dto.poll.closesAt ?? null,
        });
        await manager.getRepository(RoomPollOption).insert(
          pollOptions.map((option, position) => ({
            ...option,
            messageId: message.id,
            position,
          })),
        );
      }
      await this.notifyMentions(
        manager,
        message,
        mentionIds,
        replyTo?.authorId,
      );
      return message.id;
    });
    return this.getMessage(roomId, id, userId);
  }

  async editMessage(
    roomId: number,
    id: number,
    userId: number,
    dto: UpdateChatMessageDto,
  ) {
    const message = await this.findActiveMessage(roomId, id);
    if (message.authorId !== userId)
      throw new ForbiddenException('Only the author can edit this message');
    if (await this.manager.getRepository(RoomPoll).existsBy({ messageId: id }))
      throw new BadRequestException('Polls cannot be edited');
    const mentionIds = dto.mentionedUserIds
      ? await this.memberIds(roomId, dto.mentionedUserIds)
      : undefined;
    await this.manager.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(RoomMessage)
        .set({
          text: dto.text,
          editedAt: () => 'now()',
          updatedAt: () => 'now()',
        })
        .where('id = :id', { id })
        .execute();
      if (mentionIds) {
        const previous = await manager
          .getRepository(RoomMessageMention)
          .findBy({ messageId: id });
        const known = new Set(previous.map((mention) => mention.userId));
        // Only people newly mentioned by the edit hear about it.
        await this.notifyMentions(
          manager,
          { ...message, text: dto.text ?? message.text },
          mentionIds.filter((mentioned) => !known.has(mentioned)),
        );
        await manager
          .getRepository(RoomMessageMention)
          .delete({ messageId: id });
        if (mentionIds.length)
          await manager.getRepository(RoomMessageMention).insert(
            mentionIds.map((mentioned) => ({
              messageId: id,
              userId: mentioned,
            })),
          );
      }
    });
    return this.getMessage(roomId, id, userId);
  }

  async deleteMessage(roomId: number, id: number, userId: number) {
    const message = await this.findMessage(roomId, id);
    if (!message.deletedAt) {
      await this.requireAuthorOrOwner(message, userId, 'delete');
      await this.manager.transaction(async (manager) => {
        for (const entity of [
          RoomMessageMention,
          RoomMessageMovie,
          RoomMessageReaction,
          RoomPoll,
        ])
          await manager.getRepository(entity).delete({ messageId: id });
        await this.notifications.removeForEntity('message', id, manager);
        await manager
          .createQueryBuilder()
          .update(RoomMessage)
          .set({
            text: null,
            pinnedAt: null,
            pinnedById: null,
            deletedAt: () => 'now()',
            updatedAt: () => 'now()',
          })
          .where('id = :id', { id })
          .execute();
      });
    }
    return this.getMessage(roomId, id, userId);
  }

  async addReaction(roomId: number, id: number, userId: number, emoji: string) {
    await this.findActiveMessage(roomId, id);
    await this.manager.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(RoomMessageReaction)
        .values({ messageId: id, userId, emoji })
        .orIgnore()
        .execute();
      await this.touch(manager, id);
    });
    return this.getMessage(roomId, id, userId);
  }

  async removeReaction(
    roomId: number,
    id: number,
    userId: number,
    emoji: string,
  ) {
    await this.findMessage(roomId, id);
    await this.manager.transaction(async (manager) => {
      const result = await manager
        .getRepository(RoomMessageReaction)
        .delete({ messageId: id, userId, emoji });
      if (result.affected) await this.touch(manager, id);
    });
    return this.getMessage(roomId, id, userId);
  }

  private async findPoll(roomId: number, id: number) {
    const message = await this.findActiveMessage(roomId, id);
    const poll = await this.manager
      .getRepository(RoomPoll)
      .findOneBy({ messageId: id });
    if (!poll) throw new NotFoundException('This message has no poll');
    return { message, poll };
  }

  async vote(roomId: number, id: number, userId: number, dto: ChatPollVoteDto) {
    await this.findPoll(roomId, id);
    await this.manager.transaction(async (manager) => {
      // Serialize a user's concurrent votes so single-choice polls stay single.
      await manager
        .getRepository(RoomMessage)
        .createQueryBuilder('message')
        .where('message.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      const poll = await manager
        .getRepository(RoomPoll)
        .findOneBy({ messageId: id });
      if (!poll) throw new NotFoundException('This message has no poll');
      if (this.isClosed(poll))
        throw new BadRequestException('This poll is closed');
      if (!poll.allowsMultiple && dto.optionIds.length > 1)
        throw new BadRequestException('This poll allows one choice');
      const valid = dto.optionIds.length
        ? await manager
            .getRepository(RoomPollOption)
            .countBy({ messageId: id, id: In(dto.optionIds) })
        : 0;
      if (valid !== dto.optionIds.length)
        throw new BadRequestException('Unknown poll option');
      await manager
        .getRepository(RoomPollVote)
        .delete({ messageId: id, userId });
      if (dto.optionIds.length)
        await manager.getRepository(RoomPollVote).insert(
          dto.optionIds.map((optionId) => ({
            optionId,
            userId,
            messageId: id,
          })),
        );
      await this.touch(manager, id);
    });
    return this.getMessage(roomId, id, userId);
  }

  async closePoll(roomId: number, id: number, userId: number) {
    const { message, poll } = await this.findPoll(roomId, id);
    await this.requireAuthorOrOwner(message, userId, 'close the poll on');
    if (!poll.closedAt)
      await this.manager.transaction(async (manager) => {
        await manager
          .getRepository(RoomPoll)
          .update({ messageId: id }, { closedAt: () => 'now()' });
        await this.touch(manager, id);
      });
    return this.getMessage(roomId, id, userId);
  }

  async setPinned(roomId: number, id: number, userId: number, pinned: boolean) {
    const message = pinned
      ? await this.findActiveMessage(roomId, id)
      : await this.findMessage(roomId, id);
    await this.requireAuthorOrOwner(message, userId, pinned ? 'pin' : 'unpin');
    if (!!message.pinnedAt !== pinned)
      await this.manager
        .createQueryBuilder()
        .update(RoomMessage)
        .set({
          pinnedAt: pinned ? () => 'now()' : null,
          pinnedById: pinned ? userId : null,
          updatedAt: () => 'now()',
        })
        .where('id = :id', { id })
        .execute();
    return this.getMessage(roomId, id, userId);
  }

  async getUnread(roomId: number, userId: number) {
    const read = await this.manager
      .getRepository(RoomChatRead)
      .findOneBy({ roomId, userId });
    const last = read?.lastReadMessageId ?? 0;
    const unread = () =>
      this.messages
        .createQueryBuilder('message')
        .where('message.roomId = :roomId', { roomId })
        .andWhere('message.id > :last', { last })
        .andWhere('message.authorId != :userId', { userId })
        .andWhere('message.deletedAt IS NULL');
    const [unreadCount, mentionCount, latest] = await Promise.all([
      unread().getCount(),
      unread()
        .innerJoin(
          RoomMessageMention,
          'mention',
          'mention.messageId = message.id AND mention.userId = :userId',
          { userId },
        )
        .getCount(),
      this.messages
        .createQueryBuilder('message')
        .select('MAX(message.id)', 'max')
        .where('message.roomId = :roomId', { roomId })
        .getRawOne<{ max: number | null }>(),
    ]);
    return {
      lastReadMessageId: last || null,
      latestMessageId: latest?.max ?? null,
      unreadCount,
      mentionCount,
    };
  }

  // Read position only moves forward, so an old tab cannot mark news unread.
  async markRead(roomId: number, userId: number, messageId: number) {
    await this.findMessage(roomId, messageId);
    const reads = this.manager.getRepository(RoomChatRead);
    const updated = await reads.update(
      { roomId, userId, lastReadMessageId: LessThan(messageId) },
      { lastReadMessageId: messageId },
    );
    if (!updated.affected)
      await reads
        .createQueryBuilder()
        .insert()
        .values({ roomId, userId, lastReadMessageId: messageId })
        .orIgnore()
        .execute();
    return this.getUnread(roomId, userId);
  }

  async markLatestRead(roomId: number, userId: number) {
    const latest = await this.messages
      .createQueryBuilder('message')
      .select('MAX(message.id)', 'max')
      .where('message.roomId = :roomId', { roomId })
      .getRawOne<{ max: number | null }>();
    return latest?.max
      ? this.markRead(roomId, userId, latest.max)
      : this.getUnread(roomId, userId);
  }
}
