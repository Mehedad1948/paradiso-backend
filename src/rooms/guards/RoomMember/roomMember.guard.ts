import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { RoomAccessService } from 'src/rooms/providers/room-access.service';

@Injectable()
export class RoomMemberGuard implements CanActivate {
  constructor(private roomAccessService: RoomAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const roomId = request.params.id;
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

    throw new UnauthorizedException(
      'You are not authorized to access this room.',
    );
  }
}
