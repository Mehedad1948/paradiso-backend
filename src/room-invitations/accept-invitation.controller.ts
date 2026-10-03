import { Body, Controller, Post } from '@nestjs/common';
import { AcceptInvitationProvider } from './providers/accept-invitation.provider';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { ActiveUserData } from '../auth/interfaces/active-user-data.interface';

@Controller('room-invitations')
export class AcceptInvitationController {
  constructor(private readonly acceptProvider: AcceptInvitationProvider) {}
  @Post('accept')
  accept(@Body() dto: AcceptInvitationDto, @ActiveUser() user: ActiveUserData) {
    return this.acceptProvider.accept(dto.token, user);
  }
}
