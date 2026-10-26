import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { assertNotBanned } from '../../rooms/providers/room-moderation.provider';
import { lockRoom } from '../../rooms/providers/room-transaction';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { InvitationLifecycleService } from '../invitation-lifecycle.service';
import { InvitationStatus, RoomInvitation } from '../room-invitation.entity';
import { assertAcceptsInvites } from './create-invitation.provider';

type Role = 'invitee' | 'owner' | 'inviter';

// Thrown out of the transaction would roll back the expiry it just recorded,
// so handlers return this and the caller throws after commit.
const EXPIRED = Symbol('expired');

@Injectable()
export class InvitationActionsProvider {
  constructor(
    @InjectRepository(RoomInvitation)
    private readonly invitations: Repository<RoomInvitation>,
    private readonly lifecycle: InvitationLifecycleService,
  ) {}

  accept(id: number, userId: number) {
    return this.run(id, userId, 'invitee', async (manager, invitation) => {
      const joined = await manager.getRepository(Room).exists({
        where: { id: invitation.room.id, users: { id: userId } },
      });
      if (invitation.status === 'accepted' && joined) return;
      this.assertStatus(invitation, 'pending');
      if (!joined) {
        await assertNotBanned(manager, invitation.room.id, userId);
        await manager
          .createQueryBuilder()
          .relation(Room, 'users')
          .of(invitation.room.id)
          .add(userId);
      }
      await this.set(manager, invitation, {
        status: 'accepted',
        respondedAt: new Date(),
      });
      await this.lifecycle.notifyInviter(
        'room_invite_accepted',
        invitation,
        userId,
        manager,
      );
    });
  }

  decline(id: number, userId: number) {
    return this.run(id, userId, 'invitee', async (manager, invitation) => {
      this.assertStatus(invitation, 'pending');
      await this.set(manager, invitation, {
        status: 'declined',
        respondedAt: new Date(),
      });
    });
  }

  async approve(id: number, userId: number) {
    let emailed = false;
    const view = await this.run(
      id,
      userId,
      'owner',
      async (manager, invitation) => {
        this.assertStatus(invitation, 'awaiting_approval');
        if (invitation.invitee)
          await this.assertStillInvitable(manager, invitation);
        const now = new Date();
        await this.set(manager, invitation, {
          status: 'pending',
          pendingAt: now,
          reviewedById: userId,
          reviewedAt: now,
        });
        if (invitation.email) emailed = true;
        else await this.lifecycle.notifyInvitee(invitation, manager);
      },
    );
    if (emailed) await this.deliver(id);
    return view;
  }

  reject(id: number, userId: number) {
    return this.run(id, userId, 'owner', async (manager, invitation) => {
      this.assertStatus(invitation, 'awaiting_approval');
      await this.set(manager, invitation, {
        status: 'rejected',
        reviewedById: userId,
        reviewedAt: new Date(),
      });
      await this.lifecycle.notifyInviter(
        'room_invite_rejected',
        invitation,
        userId,
        manager,
      );
    });
  }

  cancel(id: number, userId: number) {
    return this.run(id, userId, 'inviter', async (manager, invitation) => {
      if (invitation.status !== 'awaiting_approval')
        this.assertStatus(invitation, 'pending');
      await this.set(manager, invitation, { status: 'cancelled' });
    });
  }

  private async deliver(id: number) {
    const invitation = (await this.lifecycle.load(id))!;
    await this.lifecycle.deliverEmail(invitation);
  }

  // The invitee may have changed their invite policy since the request was made.
  private async assertStillInvitable(
    manager: EntityManager,
    invitation: RoomInvitation,
  ) {
    const invitee = await manager.getRepository(User).findOneByOrFail({
      id: invitation.invitee!.id,
    });
    await assertAcceptsInvites(manager, invitee, invitation.inviterId ?? 0);
  }

  private assertStatus(invitation: RoomInvitation, expected: InvitationStatus) {
    if (invitation.status !== expected)
      throw new ConflictException('Invitation is no longer active');
  }

  private set(
    manager: EntityManager,
    invitation: RoomInvitation,
    changes: Partial<RoomInvitation>,
  ) {
    return manager.getRepository(RoomInvitation).update(invitation.id, changes);
  }

  // Common frame: lock the room first (the same order every other room writer
  // uses), authorize the caller for their role, expire overdue invitations,
  // run the transition and return the invitation as the caller should see it.
  private async run(
    id: number,
    userId: number,
    role: Role,
    transition: (
      manager: EntityManager,
      invitation: RoomInvitation,
    ) => Promise<void>,
  ) {
    const reference = await this.invitations.findOne({
      where: { id },
      select: { id: true, room: { id: true } },
      relations: { room: true },
    });
    if (!reference) throw new NotFoundException('Invitation not found');

    const outcome = await this.invitations.manager.transaction(
      async (manager) => {
        await lockRoom(manager, reference.room.id);
        const invitation = await this.lifecycle.load(id, manager);
        if (!invitation) throw new NotFoundException('Invitation not found');
        // Compare with the room's current owner, so a change of owner just works.
        const allowed =
          role === 'invitee'
            ? invitation.inviteeUserId === userId
            : role === 'inviter'
              ? invitation.inviterId === userId
              : invitation.room.owner?.id === userId;
        if (!allowed)
          throw new ForbiddenException(
            role === 'invitee'
              ? 'Only the invited user can answer this invitation'
              : role === 'inviter'
                ? 'Only the inviter can cancel this invitation'
                : 'Only the room owner can review this invitation',
          );
        // Invitees only know about invitations that were shown to them.
        if (role === 'invitee' && !invitation.pendingAt)
          throw new NotFoundException('Invitation not found');
        if (
          ['awaiting_approval', 'pending'].includes(invitation.status) &&
          invitation.expiresAt <= new Date()
        ) {
          await this.set(manager, invitation, { status: 'expired' });
          return EXPIRED;
        }
        await transition(manager, invitation);
        return (await this.lifecycle.load(id, manager))!;
      },
    );
    if (outcome === EXPIRED) throw new GoneException('Invitation has expired');
    return this.lifecycle.view(outcome);
  }
}
