import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { AuthService } from 'src/auth/providers/auth.service';
import { MailService } from 'src/mail/providers/mail.service';
import { RoomsService } from 'src/rooms/providers/rooms.service';
import { UsersService } from 'src/users/providers/users.service';
import { InviteUserToRoomDto } from '../dto/invite-user-to-room.dto';

@Injectable()
export class AddUserToRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    private readonly roomService: RoomsService,
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async inviteUserToRoom(inviteUserToRoomDto: InviteUserToRoomDto, roomId) {
    try {
      const userPayload = this.request[REQUEST_USER_KEY];
      const userId = userPayload?.sub;

      if (!userId) {
        throw new UnauthorizedException('Invalid user');
      }

      const room = await this.roomService.findRoomById(roomId);
      if (!room) {
        throw new NotFoundException('Room not found');
      }

      if (room.owner.id !== userId) {
        throw new UnauthorizedException('Only the room owner can invite users');
      }

      const invitingUser = await this.userService.findOneById(userId);

      const { inviteToken } = await this.authService.generateInvitationToken({
        inviterUsername: userPayload.username,
        email: inviteUserToRoomDto.email,
        roomId: room.id,
      });

      await this.mailService.sendInvitationEmail({
        inviterUsername: invitingUser.username,
        email: inviteUserToRoomDto.email,
        invitationToken: inviteToken,
      });
      return {
        message: 'Invitation email sent successfully',
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error; // rethrow known exceptions
      }
      // fallback for unexpected errors
      throw new InternalServerErrorException('Failed to create room');
    }
  }
}
