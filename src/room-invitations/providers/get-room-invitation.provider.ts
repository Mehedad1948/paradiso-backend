import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { AuthService } from 'src/auth/providers/auth.service';
import { MailService } from 'src/mail/providers/mail.service';
import { RoomsService } from 'src/rooms/providers/rooms.service';
import { UsersService } from 'src/users/providers/users.service';
import { Repository } from 'typeorm';
import { RoomInvitation } from '../room-invitation.entity';

@Injectable()
export class GetRoomInvitationProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly roomService: RoomsService,
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly mailService: MailService,

    @InjectRepository(RoomInvitation)
    private readonly roomInvitationRepository: Repository<RoomInvitation>,
  ) {}

  async getRoomInvitation(roomId: number) {
    try {
      const userPayload = this.request[REQUEST_USER_KEY];
      const userId = userPayload?.sub;

      if (!userId) throw new UnauthorizedException('Invalid user');

      const room = await this.roomService.findRoomById(roomId);
      if (!room) throw new NotFoundException('Room not found');

      if (room.owner.id !== userId)
        throw new UnauthorizedException(
          'Only the room owner can see invitations',
        );

      const invitations = await this.roomInvitationRepository
        .createQueryBuilder('invitation')
        .leftJoin('invitation.invitedBy', 'user')
        .leftJoin('invitation.room', 'room')
        .where('room.id = :roomId', { roomId: room.id })
        .select([
          'invitation.id',
          'invitation.email',
          'invitation.status',
          // 'invitation.userStatus',
          'user.id',
          'user.username',
          'user.avatar',
        ])
        .getMany();

      return { invitations };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch invitations');
    }
  }

  async getInvitationByRoomIdAndEmail(roomId: number, email: string) {
    try {
      const userPayload = this.request[REQUEST_USER_KEY];
      const userId = userPayload?.sub;

      if (!userId) throw new UnauthorizedException('Invalid user');

      const room = await this.roomService.findRoomById(roomId);
      if (!room) throw new NotFoundException('Room not found');

      if (room.owner.id !== userId)
        throw new UnauthorizedException(
          'Only the room owner can check invitations',
        );

      const invitation = await this.roomInvitationRepository.findOne({
        where: {
          room: { id: roomId },
          email: email.toLowerCase().trim(),
        },
        relations: ['invitedBy'],
      });

      if (!invitation) throw new NotFoundException('Invitation not found');

      return {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        invitedBy: {
          id: invitation.invitedBy?.id,
          username: invitation.invitedBy?.username,
          avatar: invitation.invitedBy?.avatar,
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get invitation');
    }
  }
}
