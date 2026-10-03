import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';

@Injectable()
export class RoomAccessService {
  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
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
    return !!room.isPublic || member;
  }

  async requireOwner(roomId: number, userId: number) {
    if (!userId) throw new UnauthorizedException();
    const { room } = await this.access(roomId, userId);
    if (room.owner?.id !== userId)
      throw new ForbiddenException(
        'Only the room owner can manage invitations',
      );
  }
}
