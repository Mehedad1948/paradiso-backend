import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { REQUEST_USER_KEY } from '../../../auth/constants/auth.constants';
import { RoomAccessService } from '../../providers/room-access.service';
import { AuthenticatedRequest } from '../../../auth/interfaces/authenticated-request.interface';

@Injectable()
export class RoomMemberGuard implements CanActivate {
  constructor(private roomAccessService: RoomAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const roomId = Number(request.params.roomId ?? request.params.id);
    if (!Number.isSafeInteger(roomId) || roomId < 1)
      throw new BadRequestException('Invalid room ID');
    const userPayload = request[REQUEST_USER_KEY];
    const userId = userPayload?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authentication required.');
    }

    const hasAccess = await this.roomAccessService.checkUserRoomAccess(
      roomId,
      userId,
    );

    if (hasAccess) {
      return true;
    }

    throw new ForbiddenException('You are not authorized to access this room.');
  }
}
