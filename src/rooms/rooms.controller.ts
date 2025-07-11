import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';
import { CreateRoomDto } from './dtos/create-room.dto';
import { GetRoomDto } from './dtos/get-room.dto';
import { RoomsService } from './providers/rooms.service';
import { JoinRoomDto } from './dtos/join-room.dto';
import { RoomMemberGuard } from 'src/rooms/guards/RoomMember/roomMember.guard';
import { GetRoomRatingDto } from './dtos/get-room-ratings';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Auth(AuthType.Bearer)
  @Post()
  async createRoom(@Body() createRoomDto: CreateRoomDto) {
    return this.roomsService.createRoom(createRoomDto);
  }

  @Auth(AuthType.Bearer)
  @Post('join')
  async joinRoom(@Body() joinRoomDto: JoinRoomDto) {
    return this.roomsService.joinRoom(joinRoomDto.userId, joinRoomDto.roomId);
  }

  @Auth(AuthType.Bearer)
  @Get()
  async getRooms(@Query() getRoomDto: GetRoomDto) {
    return this.roomsService.getAllRooms(getRoomDto);
  }

  @Auth(AuthType.Bearer)
  @UseGuards(RoomMemberGuard)
  @Get(':id')
  async getRoomById(@Param('id') id: number) {
    return await this.roomsService.findRoomById(id);
  }

  @Auth(AuthType.Bearer)
  @UseGuards(RoomMemberGuard)
  @Post('/add-movie/:id')
  async addMovieToRoom(@Param('id') id: number, @Body('dbId') dbId: number) {
    console.log('🚀🚀🚀 Adding movie to room', id, dbId);
    return await this.roomsService.addMovieToRoom(id, dbId);
  }

  @Auth(AuthType.Bearer)
  @UseGuards(RoomMemberGuard)
  @Delete('/delete-movie/:id')
  async removeMovieFromRoom(
    @Param('id') id: number,
    @Body('movieId') movieId: string,
  ) {
    return await this.roomsService.deleteMovieFromRoom(id, movieId);
  }

  @Auth(AuthType.Bearer)
  @Get(':roomId/rating')
  public getRoomRatings(
    @Param('roomId') roomId: number,
    @Query() query: GetRoomRatingDto,
  ) {
    return this.roomsService.getRoomRating(query, roomId);
  }
}
