import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { RoomAccessService } from '../providers/room-access.service';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';

@Injectable()
export class RoomReadGuard implements CanActivate {
  constructor(private readonly access: RoomAccessService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request[REQUEST_USER_KEY]?.sub;
    if (!userId) throw new UnauthorizedException();
    const roomId = Number(request.params.roomId ?? request.params.id);
    if (!Number.isSafeInteger(roomId) || roomId < 1)
      throw new BadRequestException('Invalid room ID');
    if (!(await this.access.canRead(roomId, userId)))
      throw new ForbiddenException('You cannot access this room');
    return true;
  }
}
