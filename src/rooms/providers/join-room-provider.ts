import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';

@Injectable()
export class JoinRoomProvider {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async joinToRoom(userId: number, roomId: number) {
    const room = await this.roomRepository.findOneBy({ id: roomId });
    if (!room) {
      throw new NotFoundException('Room was not found');
    }

    const existingUsers = await this.roomRepository
      .createQueryBuilder('room')
      .relation(Room, 'users')
      .of(room)
      .loadMany();

    const isAlreadyJoined = existingUsers.some((u) => u.id === userId);

    if (isAlreadyJoined) {
      throw new ConflictException('User already joined the room.');
    }

    await this.roomRepository
      .createQueryBuilder()
      .relation(Room, 'users')
      .of(room)
      .add(userId);

    return { message: 'User successfully joined the room.' };
  }
}
