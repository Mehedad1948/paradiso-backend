import { Injectable, Query } from '@nestjs/common';
import { CreateRoomDto } from '../dtos/create-room.dto';
import { GetRoomDto } from '../dtos/get-room.dto';
import { InviteUserToRoomDto } from '../dtos/invite-user-to-room.dto';
import { AddUserToRoomProvider } from './add-user-to-room.provider';
import { CreateRoomProvider } from './create-room.provider';
import { GetRoomProvider } from './get-room.provider';

@Injectable()
export class RoomsService {
  constructor(
    private readonly createRoomProvider: CreateRoomProvider,
    private readonly getRoomProvider: GetRoomProvider,
    private readonly addUserToRoomProvider: AddUserToRoomProvider,
  ) {}

  async createRoom(createRoomDto: CreateRoomDto) {
    return await this.createRoomProvider.createRoom(createRoomDto);
  }

  async getAllRooms(@Query() getRoomDto: GetRoomDto) {
    return await this.getRoomProvider.getRooms(getRoomDto);
  }

  async inviteToRoom(roomId: string, inviteUserToRoomDto: InviteUserToRoomDto) {
    return await this.addUserToRoomProvider.inviteUserToRoom(
      inviteUserToRoomDto,
      roomId,
    );
  }
}
