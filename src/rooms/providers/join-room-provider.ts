import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RoomInvitationService } from 'src/room-invitations/providers/invitations.service';
import { UsersService } from 'src/users/providers/users.service';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';

@Injectable()
export class JoinRoomProvider {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,

    private readonly userService: UsersService,
    private readonly roomInvitationService: RoomInvitationService,
  ) {}

  async joinToRoom(userId: number, roomId: number) {
    const room = await this.roomRepository.findOneBy({ id: roomId });
    if (!room) {
      throw new NotFoundException('Room was not found');
    }

    const user = await this.userService.findOneById(userId);

    const existingUsers = await this.roomRepository
      .createQueryBuilder('room')
      .relation(Room, 'users')
      .of(room)
      .loadMany();

    const isAlreadyJoined = existingUsers.some((u) => u.id === userId);

    if (isAlreadyJoined) {
      return { message: 'User already joined the room.' };
    }

    const invitation =
      await this.roomInvitationService.getInvitationByRoomIdAndEmail(
        roomId,
        user.email,
      );

    const hasInvitation = !!invitation && invitation.status === 'pending';

    if (!room.isPublic && !hasInvitation) {
      throw new ForbiddenException('This room is private');
    }

    await this.roomRepository
      .createQueryBuilder()
      .relation(Room, 'users')
      .of(room)
      .add(userId);

    return { message: 'User successfully joined the room.' };
  }
}
