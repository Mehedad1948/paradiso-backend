import { Body, Controller, Post } from '@nestjs/common';
import { RoomsService } from './providers/rooms.service';
import { Room } from './room.entity';
import { CreateRoomDto } from './dtos/create-room.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async createRoom(@Body() createRoomDto: CreateRoomDto): Promise<Room> {
    return this.roomsService.createRoom(createRoomDto.name);
  }
}
