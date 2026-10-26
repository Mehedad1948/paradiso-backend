import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { avatarOrNull } from '../users/avatar-url';
import {
  Notification,
  NotificationData,
  NotificationEntityType,
  NotificationType,
} from './notification.entity';
import {
  ListNotificationsDto,
  MarkNotificationsReadDto,
} from './notifications.dto';

export const NOTIFICATION_RETENTION_DAYS = 90;
const EXCERPT_LENGTH = 140;

export interface NotifyInput {
  type: NotificationType;
  recipientId: number;
  actorId: number;
  entityType: NotificationEntityType;
  entityId: string | number;
  roomId?: number | null;
  postId?: number | null;
  data?: NotificationData;
  // Inputs with a group key update the recipient's unread row for that key
  // instead of adding another one.
  groupKey?: string;
}

export const excerpt = (text?: string | null) => {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_LENGTH
    ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…`
    : flat;
};

interface Cursor {
  updatedAt: Date;
  id: string;
}

const encodeCursor = ({ updatedAt, id }: Cursor) =>
  Buffer.from(`${updatedAt.toISOString()}|${id}`).toString('base64url');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(value: string): Cursor {
  const [at, id] = Buffer.from(value, 'base64url').toString().split('|');
  const updatedAt = new Date(at);
  if (!id || !UUID.test(id) || Number.isNaN(updatedAt.getTime()))
    throw new BadRequestException('Invalid cursor');
  return { updatedAt, id };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  // Call from the action's own transaction (pass its manager) so the
  // notification commits or rolls back with it. Self-notifications are dropped.
  async notify(inputs: NotifyInput | NotifyInput[], manager?: EntityManager) {
    const repository = (manager ?? this.notifications.manager).getRepository(
      Notification,
    );
    const rows = (Array.isArray(inputs) ? inputs : [inputs])
      .filter((input) => input.recipientId !== input.actorId)
      .map((input) => ({
        type: input.type,
        recipientId: input.recipientId,
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: String(input.entityId),
        roomId: input.roomId ?? null,
        postId: input.postId ?? null,
        data: input.data ?? {},
        groupKey: input.groupKey ?? null,
      }));
    const single = rows.filter((row) => !row.groupKey);
    if (single.length) await repository.insert(single);
    for (const row of rows.filter((row) => row.groupKey)) {
      // The same actor twice in a row (unlike, like again) is not "1 other".
      // The alias names the existing row in DO UPDATE.
      await repository
        .createQueryBuilder('notification')
        .insert()
        .values(row)
        .onConflict(
          `("recipientId", "groupKey") WHERE "readAt" IS NULL AND "groupKey" IS NOT NULL
          DO UPDATE SET
            "actorCount" = "notification"."actorCount" +
              CASE WHEN "notification"."actorId" = EXCLUDED."actorId" THEN 0 ELSE 1 END,
            "actorId" = EXCLUDED."actorId",
            "data" = EXCLUDED."data",
            "updatedAt" = now()`,
        )
        .execute();
    }
  }

  async removeForEntity(
    entityType: NotificationEntityType,
    entityId: string | number,
    manager?: EntityManager,
  ) {
    await (manager ?? this.notifications.manager)
      .getRepository(Notification)
      .delete({ entityType, entityId: String(entityId) });
  }

  async list(userId: number, query: ListNotificationsDto) {
    const builder = this.notifications
      .createQueryBuilder('notification')
      .innerJoin('notification.actor', 'actor')
      .addSelect(['actor.id', 'actor.username', 'actor.avatar'])
      .where('notification.recipientId = :userId', { userId });
    if (query.unreadOnly) builder.andWhere('notification.readAt IS NULL');
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      builder.andWhere(
        '(notification.updatedAt, notification.id) < (:updatedAt, :id)',
        cursor,
      );
    }
    const rows = await builder
      .orderBy('notification.updatedAt', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .take(query.limit + 1)
      .getMany();
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map((row) => this.serialize(row)),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  // Polled by every open tab; served by the partial unread index.
  async unreadCount(userId: number) {
    return {
      count: await this.notifications.countBy({
        recipientId: userId,
        readAt: IsNull(),
      }),
    };
  }

  async markRead(userId: number, dto: MarkNotificationsReadDto) {
    if ((dto.all === true) === (dto.ids !== undefined))
      throw new BadRequestException('Send either ids or all: true');
    if (dto.ids?.length === 0) return { updated: 0 };
    const result = await this.notifications.update(
      {
        recipientId: userId,
        readAt: IsNull(),
        ...(dto.ids ? { id: In(dto.ids) } : {}),
      },
      // Reading is not activity, so the list order stays put.
      { readAt: () => 'now()', updatedAt: () => '"updatedAt"' },
    );
    return { updated: result.affected ?? 0 };
  }

  async remove(userId: number, id: string) {
    const result = await this.notifications.delete({ id, recipientId: userId });
    if (!result.affected) throw new NotFoundException('Notification not found');
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneRead() {
    const result = await this.notifications
      .createQueryBuilder()
      .delete()
      .where('"readAt" < now() - make_interval(days => :days)', {
        days: NOTIFICATION_RETENTION_DAYS,
      })
      .execute();
    if (result.affected)
      this.logger.log(`Deleted ${result.affected} old read notifications`);
  }

  private serialize(row: Notification) {
    return {
      id: row.id,
      type: row.type,
      read: row.readAt !== null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      actor: {
        id: row.actor.id,
        username: row.actor.username,
        // Users have a single name; displayName is reserved for when they don't.
        displayName: row.actor.username,
        avatarUrl: avatarOrNull(row.actor.avatar),
      },
      actorCount: row.actorCount,
      entity: { type: row.entityType, id: row.entityId },
      data: row.data,
      roomId: row.roomId,
    };
  }
}
