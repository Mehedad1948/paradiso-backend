import { Injectable, Query } from '@nestjs/common';
import { CreateRoomDto } from '../dtos/create-room.dto';
import { GetRoomDto } from '../dtos/get-room.dto';
import { CreateRoomProvider } from './create-room.provider';
import { GetRoomProvider } from './get-room.provider';
import { JoinRoomProvider } from './join-room-provider';
import { AddMovieToRoomProvider } from './add-movie-to-room.provider';
import { DeleteMovieFromRoomProvider } from './delete-movie-from-room.provider';
import { GetRoomRatingDto } from '../dtos/get-room-ratings';
import { UpdateRoomDto } from '../dtos/update-room.dto';
import { UpdateRoomProvider } from './update-room.provider';
import { CreateCustomMovieDto } from '../../movies/dtos/create-custom-movie.dto';

@Injectable()
export class RoomsService {
  constructor(
    private readonly createRoomProvider: CreateRoomProvider,
    private readonly getRoomProvider: GetRoomProvider,
    private readonly joinRoomProvider: JoinRoomProvider,
    private readonly addMovieToRoomProvider: AddMovieToRoomProvider,
    private readonly deleteMovieFromRoomProvider: DeleteMovieFromRoomProvider,
    private readonly updateRoomProvider: UpdateRoomProvider,
  ) {}

  async createRoom(createRoomDto: CreateRoomDto) {
    return await this.createRoomProvider.createRoom(createRoomDto);
  }

  async updateRoom(roomId: number, updateRoomDto: UpdateRoomDto) {
    await this.updateRoomProvider.updateRoom(roomId, updateRoomDto);
    return await this.getRoomProvider.findRoomById(roomId);
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

  async addMovieToRoom(
    roomId: number,
    movieId: number,
    isWatchedTogether = false,
  ) {
    return await this.addMovieToRoomProvider.addMovieToRoom(
      roomId,
      movieId,
      isWatchedTogether,
    );
  }

  async addCustomMovieToRoom(
    roomId: number,
    userId: number,
    dto: CreateCustomMovieDto,
  ) {
    return await this.addMovieToRoomProvider.addCustomMovieToRoom(
      roomId,
      userId,
      dto,
    );
  }

  async deleteMovieFromRoom(roomId: number, movieId: string) {
    return await this.deleteMovieFromRoomProvider.delete(roomId, movieId);
  }

  async getRoomRating(GetRoomRatingDto: GetRoomRatingDto, roomId: number) {
    return await this.getRoomProvider.getRatingsOfRoom(
      GetRoomRatingDto,
      roomId,
    );
  }

  async getRoomUnratedSummary(roomId: number) {
    return await this.getRoomProvider.getUnratedSummary(roomId);
  }

  async getRoomUsers(roomId: number) {
    return await this.getRoomProvider.getRoomUsers(roomId);
  }
}
