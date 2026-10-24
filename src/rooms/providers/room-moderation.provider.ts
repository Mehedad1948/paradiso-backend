import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import { Room } from '../room.entity';
import { RoomBan } from '../room-ban.entity';
import { RoomAccessService } from './room-access.service';
import { lockRoom } from './room-transaction';

// Throws if the user is banned from the room; call inside the room lock.
export async function assertNotBanned(
  manager: EntityManager,
  roomId: number,
  userId: number,
) {
  const banned = await manager
    .getRepository(RoomBan)
    .exists({ where: { room: { id: roomId }, user: { id: userId } } });
  if (banned)
    throw new ConflictException('You have been banned from this room');
}

@Injectable()
export class RoomModerationProvider {
  constructor(
    @InjectRepository(RoomBan)
    private readonly bans: Repository<RoomBan>,
    private readonly access: RoomAccessService,
  ) {}

  // Callers are verified as the owner, so targeting yourself means targeting the owner.
  private assertTargetIsNotOwner(ownerId: number, userId: number) {
    if (userId === ownerId)
      throw new BadRequestException('The room owner cannot be removed');
  }

  private async removeMember(
    manager: EntityManager,
    roomId: number,
    userId: number,
  ) {
    await manager
      .createQueryBuilder()
      .relation(Room, 'users')
      .of(roomId)
      .remove(userId);
  }

  async kick(roomId: number, ownerId: number, userId: number) {
    await this.access.requireOwner(
      roomId,
      ownerId,
      'Only the room owner can remove members',
    );
    this.assertTargetIsNotOwner(ownerId, userId);
    return this.bans.manager.transaction(async (manager) => {
      await lockRoom(manager, roomId);
      const member = await manager
        .getRepository(Room)
        .exists({ where: { id: roomId, users: { id: userId } } });
      if (!member) throw new NotFoundException('User is not a room member');
      await this.removeMember(manager, roomId, userId);
      return { message: 'User removed from the room' };
    });
  }

  async ban(roomId: number, ownerId: number, userId: number, reason?: string) {
    await this.access.requireOwner(
      roomId,
      ownerId,
      'Only the room owner can ban members',
    );
    this.assertTargetIsNotOwner(ownerId, userId);
    return this.bans.manager.transaction(async (manager) => {
      await lockRoom(manager, roomId);
      if (
        !(await manager.getRepository(User).exists({ where: { id: userId } }))
      )
        throw new NotFoundException('User not found');
      const repo = manager.getRepository(RoomBan);
      if (
        await repo.exists({
          where: { room: { id: roomId }, user: { id: userId } },
        })
      )
        throw new ConflictException('User is already banned from this room');
      await repo.save(
        repo.create({
          room: { id: roomId },
          user: { id: userId },
          bannedBy: { id: ownerId },
          reason: reason?.trim() || null,
        }),
      );
      await this.removeMember(manager, roomId, userId);
      // A pending invitation or invite link must not let the user back in.
      await manager.query(
        `UPDATE "room_invitation" SET "status" = 'expired'
         WHERE "roomId" = $1 AND "status" = 'pending'
           AND "email" = (SELECT lower("email") FROM "user" WHERE "id" = $2)`,
        [roomId, userId],
      );
      return { message: 'User banned from the room' };
    });
  }

  async unban(roomId: number, ownerId: number, userId: number) {
    await this.access.requireOwner(
      roomId,
      ownerId,
      'Only the room owner can unban members',
    );
    const result = await this.bans.delete({
      room: { id: roomId },
      user: { id: userId },
    });
    if (!result.affected) throw new NotFoundException('User is not banned');
    return { message: 'User unbanned' };
  }

  async list(roomId: number, ownerId: number) {
    await this.access.requireOwner(
      roomId,
      ownerId,
      'Only the room owner can view bans',
    );
    const bans = await this.bans.find({
      where: { room: { id: roomId } },
      relations: ['user', 'bannedBy'],
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return bans.map((ban) => ({
      id: ban.id,
      user: { id: ban.user.id, username: ban.user.username },
      bannedBy: ban.bannedBy
        ? { id: ban.bannedBy.id, username: ban.bannedBy.username }
        : null,
      reason: ban.reason,
      createdAt: ban.createdAt,
    }));
  }
}
