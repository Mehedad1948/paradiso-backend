import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';

interface InvitableRoomRow {
  id: number;
  name: string;
  image: string | null;
  isPublic: boolean;
  ownerId: number | null;
  isMember: boolean;
  hasPendingInvite: boolean;
}

@Injectable()
export class InvitableRoomsProvider {
  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
  ) {}

  // The caller's rooms, annotated for inviting `targetId` from their profile.
  async list(targetId: number, userId: number) {
    if (targetId === userId)
      throw new BadRequestException('You cannot invite yourself');
    const target = await this.rooms.manager
      .getRepository(User)
      .findOne({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    const rows = await this.rooms.query<InvitableRoomRow[]>(
      `SELECT r."id", r."name", r."image", r."isPublic", r."ownerId",
         EXISTS (SELECT 1 FROM "room_users_user" t
                 WHERE t."roomId" = r."id" AND t."userId" = $2) AS "isMember",
         EXISTS (SELECT 1 FROM "room_invitation" i
                 WHERE i."roomId" = r."id" AND i."inviteeUserId" = $2
                   AND i."status" IN ('awaiting_approval', 'pending')
                   AND i."expiresAt" > now()) AS "hasPendingInvite"
       FROM "room" r
       JOIN "room_users_user" me ON me."roomId" = r."id" AND me."userId" = $1
       ORDER BY lower(r."name"), r."id"`,
      [userId, targetId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      image: row.image,
      isPublic: row.isPublic,
      isMember: row.isMember,
      hasPendingInvite: row.hasPendingInvite,
      // A member who is not the owner needs the owner's approval in a private room.
      requiresApproval: !row.isPublic && row.ownerId !== userId,
    }));
  }
}
