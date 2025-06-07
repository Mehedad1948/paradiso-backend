import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';
import { CreateRoomDto } from './dtos/create-room.dto';
import { GetRoomDto } from './dtos/get-room.dto';
import { RoomsService } from './providers/rooms.service';
import { InviteUserToRoomDto } from './dtos/invite-user-to-room.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Auth(AuthType.Bearer)
  @Post()
  async createRoom(@Body() createRoomDto: CreateRoomDto) {
    return this.roomsService.createRoom(createRoomDto);
  }

  @Auth(AuthType.Bearer)
  @Get()
  async getRooms(@Query() getRoomDto: GetRoomDto) {
    return this.roomsService.getAllRooms(getRoomDto);
  }

  @Auth(AuthType.Bearer)
  @Post('invite/:roomId')
  async inviteUserToRoom(
    @Param('roomId') roomId: string,
    @Body() inviteUserToRoomDto: InviteUserToRoomDto,
  ) {
    return await this.roomsService.inviteToRoom(roomId, inviteUserToRoomDto);
  }
}
