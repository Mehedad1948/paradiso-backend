import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateRoomInviteLinkDto } from './dto/create-room-invite-link.dto';
import { UpdateRoomInviteLinkDto } from './dto/update-room-invite-link.dto';
import { RoomInviteLinksService } from './providers/room-invite-links.service';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';

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

  @Get(':token')
  getOneByToken(@Param('token') token: string) {
    return this.roomInviteLinksService.getOne(token);
  }

  @Auth(AuthType.Bearer)
  @Patch(':id')
  update(
    @Param('roomId') roomId: number,
    @Param('id') id: string,
    @Body() updateRoomInviteLinkDto: UpdateRoomInviteLinkDto,
  ) {
    return this.roomInviteLinksService.update(id, updateRoomInviteLinkDto);
  }

  @Auth(AuthType.Bearer)
  @Delete(':id')
  remove(@Param('roomId') roomId: number, @Param('id') id: string) {
    return this.roomInviteLinksService.remove(Number(id));
  }

  @Auth(AuthType.Bearer)
  @Get('/verify/:token')
  verify(@Param('token') token: string) {
    return this.roomInviteLinksService.verify(token);
  }
}
