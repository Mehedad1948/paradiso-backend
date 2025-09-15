import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';
import { CreateRoomInviteLinkDto } from './dto/create-room-invite-link.dto';
import { RoomInviteLinksService } from './providers/room-invite-links.service';

@Controller('rooms/:roomId/invite-links')
export class RoomInviteLinksController {
  constructor(
    private readonly roomInviteLinksService: RoomInviteLinksService,
  ) {}

  @Auth(AuthType.Bearer)
  @Post()
  create(
    @Param('roomId') roomId: number,
    @Body() createRoomInviteLinkDto: CreateRoomInviteLinkDto,
  ) {
    return this.roomInviteLinksService.create({
      ...createRoomInviteLinkDto,
      roomId: Number(roomId),
    });
  }

  @Auth(AuthType.Bearer)
  @Get()
  findAll(
    @Param('roomId') roomId: number,
    @Query() query: { page: number; limit: number },
  ) {
    return this.roomInviteLinksService.findAll({
      ...query,
      roomId: Number(roomId),
    });
  }

  @Auth(AuthType.Bearer)
  @Delete(':id')
  remove(@Param('roomId') roomId: number, @Param('id') id: string) {
    return this.roomInviteLinksService.remove(Number(id));
  }
}
