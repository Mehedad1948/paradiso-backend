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
import { InjectRepository } from '@nestjs/typeorm';
import { RoomInvitation } from '../room-invitation.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AddUserToRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    private readonly roomService: RoomsService,
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly mailService: MailService,

    @InjectRepository(RoomInvitation)
    private readonly roomInvitationRepository: Repository<RoomInvitation>,
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

      const invitedUser = await this.userService.findOneByEmail(
        inviteUserToRoomDto.email,
      );

      // Check for existing invitation for this email & room
      const existingInvitation = await this.roomInvitationRepository.findOne({
        where: {
          email: inviteUserToRoomDto.email,
          room,
        },
      });

      if (
        existingInvitation &&
        (existingInvitation.status === 'pending' ||
          existingInvitation.status === 'accepted')
      ) {
        throw new ConflictException(
          'An invitation for this email already exists and is still active.',
        );
      }

      await this.mailService.sendInvitationEmail({
        inviterUsername: invitingUser.username,
        email: inviteUserToRoomDto.email,
        invitationToken: inviteToken,
      });

      const createdInvitation = this.roomInvitationRepository.create({
        email: inviteUserToRoomDto.email,
        room,
        invitedBy: invitingUser,
        status: 'pending',
        userStatus: invitedUser
          ? invitedUser.isEmailVerified
            ? 'member'
            : 'notVerified'
          : 'guest',
      });

      await this.roomInvitationRepository.save(createdInvitation);
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
