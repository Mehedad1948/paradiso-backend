import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';
import { lockRoom } from './room-transaction';

@Injectable()
export class JoinRoomProvider {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async joinToRoom(userId: number, roomId: number) {
    return this.roomRepository.manager.transaction(async (manager) => {
      const room = await lockRoom(manager, roomId);
      if (!room.isPublic)
        throw new ForbiddenException(
          'An invitation is required to join this room',
        );
      const joined = await manager
        .getRepository(Room)
        .exists({ where: { id: roomId, users: { id: userId } } });
      if (joined) throw new ConflictException('User already joined the room');
      await manager
        .createQueryBuilder()
        .relation(Room, 'users')
        .of(roomId)
        .add(userId);
      return { message: 'User successfully joined the room.' };
    });
  }
}
