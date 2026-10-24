import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rating } from '../../ratings/rating.entity';
import { RoomChatRead } from '../../room-chat/room-message.entity';
import { Room } from '../room.entity';
import { lockRoom } from './room-transaction';

@Injectable()
export class LeaveRoomProvider {
  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
  ) {}

  async leave(roomId: number, userId: number, clearVotes = false) {
    return this.rooms.manager.transaction(async (manager) => {
      await lockRoom(manager, roomId);
      const room = await manager
        .getRepository(Room)
        .findOne({ where: { id: roomId }, relations: ['owner'] });
      const member = await manager
        .getRepository(Room)
        .exists({ where: { id: roomId, users: { id: userId } } });
      if (!member) throw new NotFoundException('You are not a room member');
      // Rooms have no admin role yet, so the owner is the only one who can manage it.
      if (room?.owner?.id === userId)
        throw new BadRequestException(
          'The room owner cannot leave the room while there is no other admin',
        );

      if (clearVotes) {
        await manager
          .getRepository(Rating)
          .delete({ user: { id: userId }, room: { id: roomId } });
        // Closed polls keep their votes so published results stay stable.
        await manager.query(
          `DELETE FROM "room_poll_vote" v
           USING "room_poll" p, "room_message" m
           WHERE v."messageId" = p."messageId" AND p."messageId" = m."id"
             AND m."roomId" = $1 AND v."userId" = $2
             AND p."closedAt" IS NULL
             AND (p."closesAt" IS NULL OR p."closesAt" > now())`,
          [roomId, userId],
        );
      }
      await manager.getRepository(RoomChatRead).delete({ roomId, userId });
      await manager
        .createQueryBuilder()
        .relation(Room, 'users')
        .of(roomId)
        .remove(userId);
      return { message: 'You left the room', votesCleared: clearVotes };
    });
  }
}
