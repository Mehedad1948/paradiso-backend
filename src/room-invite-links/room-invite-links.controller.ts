import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { CreateRoomInviteLinkDto } from './dto/create-room-invite-link.dto';
import { UpdateRoomInviteLinkDto } from './dto/update-room-invite-link.dto';
import { GetRoomInviteLinkDto } from './dto/get-room-invite-link.dto';
import { RoomInviteLinksService } from './providers/room-invite-links.service';

@Controller('rooms/:roomId/invite-links')
export class RoomInviteLinksController {
  constructor(
    private readonly roomInviteLinksService: RoomInviteLinksService,
  ) {}

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

  @Patch(':id')
  update(
    @Param('roomId') roomId: number,
    @Param('id') id: string,
    @Body() updateRoomInviteLinkDto: UpdateRoomInviteLinkDto,
  ) {
    return this.roomInviteLinksService.update(id, updateRoomInviteLinkDto);
  }

  @Delete(':id')
  remove(@Param('roomId') roomId: number, @Param('id') id: string) {
    return this.roomInviteLinksService.remove(Number(id));
  }

  @Get('/verify/:token')
  verify(@Param('token') token: string) {
    return this.roomInviteLinksService.verify(token);
  }
}
