import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { CreateRoomInviteLinkDto } from './dto/create-room-invite-link.dto';
import { RoomInviteLinksService } from './providers/room-invite-links.service';
import { PaginationQueryDto } from '../common/pagination/dtos/pagination-query.dto';
import { UpdateRoomInviteLinkDto } from './dto/update-room-invite-link.dto';

@Controller('rooms/:roomId/invite-links')
export class RoomInviteLinksController {
  constructor(
    private readonly roomInviteLinksService: RoomInviteLinksService,
  ) {}

  @Auth(AuthType.Bearer)
  @Post()
  create(
    @Param('roomId', ParseIntPipe) roomId: number,
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
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.roomInviteLinksService.findAll({
      ...query,
      roomId: Number(roomId),
    });
  }

  @Auth(AuthType.Bearer)
  @Patch(':id')
  update(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoomInviteLinkDto,
  ) {
    return this.roomInviteLinksService.update(id, roomId, dto);
  }

  @Auth(AuthType.Bearer)
  @Delete(':id')
  remove(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.roomInviteLinksService.remove(id, roomId);
  }
}
