import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Room } from '../room.entity';

// Serialize membership, movie, and rating writes for a room without locking joins.
export async function lockRoom(manager: EntityManager, roomId: number) {
  const room = await manager
    .getRepository(Room)
    .createQueryBuilder('room')
    .where('room.id = :roomId', { roomId })
    .setLock('pessimistic_write')
    .getOne();
  if (!room) throw new NotFoundException('Room not found');
  return room;
}
