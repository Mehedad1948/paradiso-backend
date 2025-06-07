import { Injectable, Query } from '@nestjs/common';
import { CreateRoomDto } from '../dtos/create-room.dto';
import { GetRoomDto } from '../dtos/get-room.dto';
import { CreateRoomProvider } from './create-room.provider';
import { GetRoomProvider } from './get-room.provider';

@Injectable()
export class RoomsService {
  constructor(
    private readonly createRoomProvider: CreateRoomProvider,
    private readonly getRoomProvider: GetRoomProvider,
  ) {}

  async createRoom(createRoomDto: CreateRoomDto) {
    return await this.createRoomProvider.createRoom(createRoomDto);
  }

  async getAllRooms(@Query() getRoomDto: GetRoomDto) {
    return await this.getRoomProvider.getRooms(getRoomDto);
  }

  async findRoomById(roomId: number) {
    return await this.getRoomProvider.findRoomById(roomId);
  }
}
