import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { GenerateTokensProvider } from '../auth/providers/generate-tokens.provider';
import { MailService } from '../mail/providers/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationData,
  NotificationType,
} from '../notifications/notification.entity';
import { avatarOrNull } from '../users/avatar-url';
import { User } from '../users/user.entity';
import {
  InvitationStatus,
  OPEN_INVITATION_STATUSES,
  RoomInvitation,
} from './room-invitation.entity';

export const INVITATION_TTL_DAYS = 14;
export const INVITES_PER_USER_PER_DAY = 20;

const OPEN_SQL = OPEN_INVITATION_STATUSES.map((s) => `'${s}'`).join(', ');
const DAY_MS = 24 * 60 * 60 * 1000;

const publicUser = (user: User | null) =>
  user
    ? {
        id: user.id,
        username: user.username,
        avatar: avatarOrNull(user.avatar),
      }
    : null;

export const isOpen = (invitation: Pick<RoomInvitation, 'status'>) =>
  (OPEN_INVITATION_STATUSES as readonly string[]).includes(invitation.status);

export const isExpired = (
  invitation: Pick<RoomInvitation, 'status' | 'expiresAt'>,
  now = new Date(),
) => isOpen(invitation) && invitation.expiresAt <= now;

// Statuses are written by the hourly job, so reads treat overdue open
// invitations as expired too.
export function applyStatusFilter(
  builder: SelectQueryBuilder<RoomInvitation>,
  status?: InvitationStatus,
) {
  if (!status) return builder;
  if (status === 'expired')
    return builder.andWhere(
      `(invitation.status = 'expired' OR (invitation.status IN (${OPEN_SQL}) AND invitation.expiresAt <= now()))`,
    );
  if ((OPEN_INVITATION_STATUSES as readonly string[]).includes(status))
    return builder.andWhere(
      'invitation.status = :status AND invitation.expiresAt > now()',
      { status },
    );
  return builder.andWhere('invitation.status = :status', { status });
}

// Invitation state changes that other modules trigger (leaving, going public,
// joining by another route) and everything the invitation endpoints share:
// serialization, notifications and email delivery. It holds no request state
// so the expiry job can run on it.
@Injectable()
export class InvitationLifecycleService {
  private readonly logger = new Logger(InvitationLifecycleService.name);

  constructor(
    @InjectRepository(RoomInvitation)
    private readonly invitations: Repository<RoomInvitation>,
    private readonly notifications: NotificationsService,
    // Not AuthService: it depends on request-scoped users providers, which would
    // make this service request-scoped and stop its cron job from running.
    private readonly tokens: GenerateTokensProvider,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  newExpiry() {
    return new Date(Date.now() + INVITATION_TTL_DAYS * DAY_MS);
  }

  // Seconds an emailed token stays valid.
  get tokenTtlSeconds() {
    return this.config.get<number>('jwt.invitationTokenTtl') ?? 3600;
  }

  // Joins what responses and notifications need, selecting only public fields.
  query(manager?: EntityManager) {
    return (manager?.getRepository(RoomInvitation) ?? this.invitations)
      .createQueryBuilder('invitation')
      .innerJoin('invitation.room', 'room')
      .leftJoin('room.owner', 'owner')
      .leftJoin('invitation.inviter', 'inviter')
      .leftJoin('invitation.invitee', 'invitee')
      .leftJoin('invitation.reviewedBy', 'reviewer')
      .select([
        'invitation',
        'room.id',
        'room.name',
        'room.image',
        'room.isPublic',
        'owner.id',
        'inviter.id',
        'inviter.username',
        'inviter.avatar',
        'invitee.id',
        'invitee.username',
        'invitee.avatar',
        'reviewer.id',
        'reviewer.username',
        'reviewer.avatar',
      ]);
  }

  load(id: number, manager?: EntityManager) {
    return this.query(manager).where('invitation.id = :id', { id }).getOne();
  }

  view(invitation: RoomInvitation) {
    return {
      id: invitation.id,
      status: isExpired(invitation) ? 'expired' : invitation.status,
      room: {
        id: invitation.room.id,
        name: invitation.room.name,
        image: invitation.room.image ?? null,
        isPublic: invitation.room.isPublic ?? true,
      },
      inviter: publicUser(invitation.inviter),
      invitee: publicUser(invitation.invitee),
      email: invitation.email,
      userStatus: invitation.userStatus,
      reviewedBy: publicUser(invitation.reviewedBy),
      reviewedAt: invitation.reviewedAt,
      respondedAt: invitation.respondedAt,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
    };
  }

  // --- Notifications ---------------------------------------------------

  private notify(
    type: NotificationType,
    invitation: RoomInvitation,
    recipientId: number | null | undefined,
    actorId: number | null | undefined,
    manager?: EntityManager,
    groupKey?: string,
    extra: NotificationData = {},
  ) {
    if (!recipientId || !actorId) return Promise.resolve();
    return this.notifications.notify(
      {
        type,
        recipientId,
        actorId,
        entityType: 'room',
        entityId: invitation.room.id,
        roomId: invitation.room.id,
        groupKey,
        data: {
          roomName: invitation.room.name,
          roomImage: invitation.room.image ?? null,
          invitationId: invitation.id,
          ...extra,
        },
      },
      manager,
    );
  }

  // The invitation has just become pending. A later invite to the same room
  // refreshes the unread notification instead of stacking another.
  notifyInvitee(
    invitation: RoomInvitation,
    manager?: EntityManager,
    inviteToken?: string,
  ) {
    return this.notify(
      'room_invite',
      invitation,
      invitation.inviteeUserId,
      invitation.inviterId,
      manager,
      `room_invite:${invitation.room.id}`,
      inviteToken ? { inviteToken } : {},
    );
  }

  notifyOwner(invitation: RoomInvitation, manager?: EntityManager) {
    return this.notify(
      'room_invite_approval',
      invitation,
      invitation.room.owner?.id,
      invitation.inviterId,
      manager,
    );
  }

  notifyInviter(
    type:
      | 'room_invite_accepted'
      | 'room_invite_rejected'
      | 'room_invite_declined',
    invitation: RoomInvitation,
    actorId: number,
    manager?: EntityManager,
  ) {
    return this.notify(
      type,
      invitation,
      invitation.inviterId,
      actorId,
      manager,
    );
  }

  // --- Email ------------------------------------------------------------

  // Sends the token link for an invitation that is pending, then tells the
  // invitee in the app if they have an account (the notification carries the
  // same token). A failed delivery expires the invitation so it never blocks a
  // retry. `invitation` must be freshly loaded: the token is bound to its
  // updatedAt.
  async deliverEmail(invitation: RoomInvitation) {
    const inviterUsername = invitation.inviter?.username ?? 'A Paradiso member';
    let inviteToken: string;
    try {
      ({ inviteToken } = await this.tokens.generateInviteToken({
        inviterUsername,
        email: invitation.email!,
        roomId: invitation.room.id,
        invitationId: invitation.id,
        invitationVersion: invitation.updatedAt.toISOString(),
      }));
      await this.mail.sendInvitationEmail({
        inviterUsername,
        email: invitation.email!,
        invitationToken: inviteToken,
      });
    } catch {
      await this.invitations.update(
        { id: invitation.id, status: 'pending' },
        { status: 'expired' },
      );
      throw new ServiceUnavailableException(
        'Invitation email could not be sent. Please retry.',
      );
    }
    await this.notifyInvitee(invitation, undefined, inviteToken);
  }

  // Delivery for email invitations that became pending with nobody waiting on
  // the response (room made public). Call after the transaction commits.
  async deliverPending(ids: number[]) {
    if (!ids.length) return;
    const rows = await this.query()
      .where('invitation.id IN (:...ids)', { ids })
      .andWhere("invitation.status = 'pending'")
      .getMany();
    for (const invitation of rows) {
      try {
        await this.deliverEmail(invitation);
      } catch (error) {
        this.logger.warn(
          `Invitation ${invitation.id} email failed: ${(error as Error).message}`,
        );
      }
    }
  }

  // --- Hooks for other modules (call inside the room-locked transaction) ----

  // A member left or was removed: their unreviewed invitations lose their sponsor.
  async cancelAwaitingFrom(
    manager: EntityManager,
    roomId: number,
    inviterId: number,
  ) {
    await manager.query(
      `UPDATE "room_invitation" SET "status" = 'cancelled', "updatedAt" = now()
       WHERE "roomId" = $1 AND "inviterId" = $2 AND "status" = 'awaiting_approval'`,
      [roomId, inviterId],
    );
  }

  // The room became public, so invitations waiting on the owner no longer need
  // review. Returns the ids whose email still has to go out after commit.
  async approveAllAwaiting(manager: EntityManager, roomId: number) {
    const moved = await this.returning<{ id: number }>(
      manager,
      `UPDATE "room_invitation" SET "status" = 'pending', "pendingAt" = now(), "updatedAt" = now()
       WHERE "roomId" = $1 AND "status" = 'awaiting_approval' AND "expiresAt" > now()
       RETURNING "id"`,
      [roomId],
    );
    if (!moved.length) return [];
    const rows = await this.query(manager)
      .where('invitation.id IN (:...ids)', { ids: moved.map((row) => row.id) })
      .getMany();
    const emailed: number[] = [];
    for (const invitation of rows) {
      if (invitation.email) emailed.push(invitation.id);
      else await this.notifyInvitee(invitation, manager);
    }
    return emailed;
  }

  // The user became a member some other way (Join button, invite link, token):
  // whatever was open for them is now fulfilled.
  async acceptOpenFor(manager: EntityManager, roomId: number, userId: number) {
    const accepted = await this.returning<{ id: number }>(
      manager,
      `UPDATE "room_invitation" SET "status" = 'accepted', "respondedAt" = now(), "updatedAt" = now()
       WHERE "roomId" = $1 AND "status" IN (${OPEN_SQL})
         AND ("inviteeUserId" = $2 OR lower("email") = (SELECT lower("email") FROM "user" WHERE "id" = $2))
       RETURNING "id"`,
      [roomId, userId],
    );
    if (!accepted.length) return;
    const rows = await this.query(manager)
      .where('invitation.id IN (:...ids)', { ids: accepted.map((r) => r.id) })
      .getMany();
    for (const invitation of rows)
      await this.notifyInviter(
        'room_invite_accepted',
        invitation,
        userId,
        manager,
      );
  }

  // UPDATE ... RETURNING comes back from the driver as [rows, count].
  private async returning<T>(
    manager: EntityManager,
    sql: string,
    params: unknown[],
  ): Promise<T[]> {
    const result = await manager.query(sql, params);
    return (Array.isArray(result[0]) ? result[0] : result) as T[];
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireOverdue() {
    const result = await this.invitations
      .createQueryBuilder()
      .update()
      .set({ status: 'expired' })
      .where(`"status" IN (${OPEN_SQL}) AND "expiresAt" <= now()`)
      .execute();
    if (result.affected)
      this.logger.log(`Expired ${result.affected} room invitations`);
  }

  // Frees the slot an overdue invitation still holds in the open-invite indexes.
  async expireOverdueFor(
    manager: EntityManager,
    roomId: number,
    target: { inviteeUserId?: number; email?: string },
  ) {
    const builder = manager
      .getRepository(RoomInvitation)
      .createQueryBuilder()
      .update()
      .set({ status: 'expired' })
      .where(
        `"roomId" = :roomId AND "status" IN (${OPEN_SQL}) AND "expiresAt" <= now()`,
        { roomId },
      );
    if (target.inviteeUserId)
      builder.andWhere('"inviteeUserId" = :uid', { uid: target.inviteeUserId });
    if (target.email)
      builder.andWhere('"email" = :email', { email: target.email });
    await builder.execute();
  }

  sentInLastDay(manager: EntityManager, inviterId: number) {
    return manager
      .getRepository(RoomInvitation)
      .createQueryBuilder('invitation')
      .where('invitation.inviterId = :inviterId', { inviterId })
      .andWhere("invitation.createdAt > now() - interval '1 day'")
      .getCount();
  }
}
