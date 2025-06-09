// src/rooms/room-access.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service'; // Or inject RoomRepository directly

@Injectable()
export class RoomAccessService {
  constructor(private roomsService: RoomsService) {} // Or inject RoomRepository

  async checkUserRoomAccess(roomId: number, userId: number): Promise<boolean> {
    const room = await this.roomsService.findRoomById(roomId); // You might need a more lightweight query here if not all details are needed

    if (!room) {
      throw new NotFoundException('Room not found.');
    }

    const isOwner = room.owner && room.owner.id === userId;
    const isMember = room.users.some((user) => user.id === userId);

    if (room.isPublic || isOwner || isMember) {
      return true;
    }
    return false; // Or throw UnauthorizedException directly here
  }
}
