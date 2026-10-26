import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { UserFollow } from '../../community/user-follow.entity';
import { assertNotBanned } from '../../rooms/providers/room-moderation.provider';
import { lockRoom } from '../../rooms/providers/room-transaction';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { InviteUserToRoomDto } from '../dto/invite-user-to-room.dto';
import {
  INVITES_PER_USER_PER_DAY,
  InvitationLifecycleService,
} from '../invitation-lifecycle.service';
import { RoomInvitation } from '../room-invitation.entity';

export const INVITE_BLOCKED_MESSAGE =
  'This user is not accepting room invitations from you';

// The invitee's roomInvitePolicy, for any inviter including the owner.
export async function assertAcceptsInvites(
  manager: EntityManager,
  invitee: Pick<User, 'id' | 'roomInvitePolicy'>,
  inviterId: number,
) {
  if (invitee.roomInvitePolicy === 'everyone') return;
  const allowed =
    invitee.roomInvitePolicy === 'following' &&
    (await manager.getRepository(UserFollow).exists({
      where: { followerId: invitee.id, followingId: inviterId },
    }));
  if (!allowed) throw new ForbiddenException(INVITE_BLOCKED_MESSAGE);
}

@Injectable()
export class CreateInvitationProvider {
  constructor(
    @InjectRepository(RoomInvitation)
    private readonly invitations: Repository<RoomInvitation>,
    private readonly lifecycle: InvitationLifecycleService,
  ) {}

  async create(dto: InviteUserToRoomDto, roomId: number, inviterId: number) {
    if ((dto.userId === undefined) === (dto.email === undefined))
      throw new BadRequestException('Send either userId or email');
    const users = this.invitations.manager.getRepository(User);
    const email = dto.email?.trim().toLowerCase();
    const invitee = dto.userId
      ? await users.findOneBy({ id: dto.userId })
      : await users
          .createQueryBuilder('user')
          .where('lower(user.email) = :email', { email })
          .getOne();
    if (dto.userId && !invitee) throw new NotFoundException('User not found');
    if (invitee?.id === inviterId)
      throw new BadRequestException('You cannot invite yourself');

    const { id, status } = await this.invitations.manager
      .transaction(async (manager) => {
        await lockRoom(manager, roomId);
        const room = await manager
          .getRepository(Room)
          .findOneOrFail({ where: { id: roomId }, relations: ['owner'] });
        const isOwner = room.owner?.id === inviterId;
        const member =
          isOwner ||
          (await manager
            .getRepository(Room)
            .exists({ where: { id: roomId, users: { id: inviterId } } }));
        if (!member)
          throw new ForbiddenException('Only room members can invite users');

        if (invitee) {
          if (
            await manager.getRepository(Room).exists({
              where: { id: roomId, users: { id: invitee.id } },
            })
          )
            throw new ConflictException('User is already a room member');
          await assertNotBanned(manager, roomId, invitee.id);
          await assertAcceptsInvites(manager, invitee, inviterId);
        }

        if (
          (await this.lifecycle.sentInLastDay(manager, inviterId)) >=
          INVITES_PER_USER_PER_DAY
        )
          throw new HttpException(
            'Invitation limit reached. Try again tomorrow.',
            HttpStatus.TOO_MANY_REQUESTS,
          );

        await this.freeOpenSlot(manager, roomId, invitee, email);

        const repo = manager.getRepository(RoomInvitation);
        const status =
          isOwner || room.isPublic ? 'pending' : 'awaiting_approval';
        const now = new Date();
        const saved = await repo.save(
          repo.create({
            room: { id: roomId },
            inviterId,
            inviteeUserId: invitee?.id ?? null,
            email: email ?? null,
            status,
            pendingAt: status === 'pending' ? now : null,
            expiresAt: this.lifecycle.newExpiry(),
            userStatus: invitee
              ? invitee.isEmailVerified
                ? 'member'
                : 'notVerified'
              : 'guest',
          }),
        );
        const invitation = (await this.lifecycle.load(saved.id, manager))!;
        // Emailed invitations notify once the email is out, below.
        if (status === 'awaiting_approval')
          await this.lifecycle.notifyOwner(invitation, manager);
        else if (!email)
          await this.lifecycle.notifyInvitee(invitation, manager);
        return { id: saved.id, status };
      })
      .catch((error: unknown) => {
        if (
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string }).code === '23505'
        )
          throw new ConflictException(
            'An open invitation for this user already exists',
          );
        throw error;
      });

    const invitation = (await this.lifecycle.load(id))!;
    if (status === 'pending' && email)
      await this.lifecycle.deliverEmail(invitation);
    return this.lifecycle.view(invitation);
  }

  // Leaves no overdue or stale row in the way of the unique open-invite indexes,
  // and rejects when a live open invitation exists.
  private async freeOpenSlot(
    manager: EntityManager,
    roomId: number,
    invitee: User | null,
    email: string | undefined,
  ) {
    await this.lifecycle.expireOverdueFor(manager, roomId, {
      inviteeUserId: invitee?.id,
      email,
    });
    const repo = manager.getRepository(RoomInvitation);
    const open = await repo
      .createQueryBuilder('invitation')
      .where('invitation.room = :roomId', { roomId })
      .andWhere("invitation.status IN ('awaiting_approval', 'pending')")
      .andWhere(
        '(invitation.inviteeUserId = :uid OR invitation.email = :email)',
        { uid: invitee?.id ?? 0, email: email ?? '' },
      )
      .getMany();
    if (!open.length) return;
    // An email link to someone without an account dies with its token, so a
    // resend replaces it. Accounts can still answer in the app.
    const stale = (row: RoomInvitation) =>
      !row.inviteeUserId &&
      row.status === 'pending' &&
      Date.now() - row.updatedAt.valueOf() >
        this.lifecycle.tokenTtlSeconds * 1000;
    if (!invitee && open.every(stale)) {
      await repo.update(
        open.map((row) => row.id),
        { status: 'expired' },
      );
      return;
    }
    throw new ConflictException(
      'An open invitation for this user already exists',
    );
  }
}
