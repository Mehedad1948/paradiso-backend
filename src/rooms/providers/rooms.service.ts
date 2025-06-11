import { Injectable, Query } from '@nestjs/common';
import { CreateRoomDto } from '../dtos/create-room.dto';
import { GetRoomDto } from '../dtos/get-room.dto';
import { CreateRoomProvider } from './create-room.provider';
import { GetRoomProvider } from './get-room.provider';
import { JoinRoomProvider } from './join-room-provider';
import { AddMovieToRoomProvider } from './add-movie-to-room.provider';
import { DeleteMovieFromRoomProvider } from './delete-movie-from-room.provider';

@Injectable()
export class RoomsService {
  constructor(
    private readonly createRoomProvider: CreateRoomProvider,
    private readonly getRoomProvider: GetRoomProvider,
    private readonly joinRoomProvider: JoinRoomProvider,
    private readonly addMovieToRoomProvider: AddMovieToRoomProvider,
    private readonly deleteMovieFromRoomProvider: DeleteMovieFromRoomProvider,
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

  async joinRoom(userId: number, roomId: number) {
    return await this.joinRoomProvider.joinToRoom(userId, roomId);
  }

  async addMovieToRoom(roomId: number, movieId: number) {
    return await this.addMovieToRoomProvider.addMovieToRoom(roomId, movieId);
  }

  async deleteMovieFromRoom(roomId: number, movieId: string) {
    return await this.deleteMovieFromRoomProvider.delete(roomId, movieId);
  }
}
