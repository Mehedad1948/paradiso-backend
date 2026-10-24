import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';
import { RoomBan } from '../room-ban.entity';

@Injectable()
export class RoomAccessService {
  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(RoomBan) private readonly bans: Repository<RoomBan>,
  ) {}

  private async access(roomId: number, userId: number) {
    const room = await this.rooms
      .createQueryBuilder('room')
      .leftJoin('room.owner', 'owner')
      .leftJoin('room.users', 'member', 'member.id = :userId', { userId })
      .select(['room.id', 'room.isPublic', 'owner.id', 'member.id'])
      .where('room.id = :roomId', { roomId })
      .getOne();
    if (!room) throw new NotFoundException('Room not found');
    return { room, member: room.owner?.id === userId || !!room.users?.length };
  }

  async checkUserRoomAccess(roomId: number, userId: number): Promise<boolean> {
    return (await this.access(roomId, userId)).member;
  }

  async canRead(roomId: number, userId: number): Promise<boolean> {
    const { room, member } = await this.access(roomId, userId);
    if (member) return true;
    // Banned users lose read access even to public rooms.
    return !!room.isPublic && !(await this.isBanned(roomId, userId));
  }

  async isBanned(roomId: number, userId: number): Promise<boolean> {
    return this.bans.exists({
      where: { room: { id: roomId }, user: { id: userId } },
    });
  }

  // Lets clients tell a ban apart from a plain lack of access.
  async denyAccess(
    roomId: number,
    userId: number,
    message: string,
  ): Promise<never> {
    if (await this.isBanned(roomId, userId))
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'You have been banned from this room',
        code: 'ROOM_BANNED',
      });
    throw new ForbiddenException(message);
  }

  async requireOwner(
    roomId: number,
    userId: number,
    message = 'Only the room owner can manage invitations',
  ) {
    if (!userId) throw new UnauthorizedException();
    const { room } = await this.access(roomId, userId);
    if (room.owner?.id !== userId) throw new ForbiddenException(message);
  }
}
