import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { CreateRoomDto } from './dtos/create-room.dto';
import { GetRoomDto } from './dtos/get-room.dto';
import { RoomsService } from './providers/rooms.service';
import { JoinRoomDto } from './dtos/join-room.dto';
import { RoomMemberGuard } from './guards/RoomMember/roomMember.guard';
import { GetRoomRatingDto } from './dtos/get-room-ratings';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { ActiveUserData } from '../auth/interfaces/active-user-data.interface';
import { RoomReadGuard } from './guards/room-read.guard';
import { AddRoomMovieDto, RemoveRoomMovieDto } from './dtos/room-movie.dto';

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
  async joinRoom(
    @Body() joinRoomDto: JoinRoomDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.roomsService.joinRoom(user.sub, joinRoomDto.roomId);
  }

  @Auth(AuthType.Bearer)
  @Get()
  async getRooms(@Query() getRoomDto: GetRoomDto) {
    return this.roomsService.getAllRooms(getRoomDto);
  }

  @Auth(AuthType.Bearer)
  @UseGuards(RoomReadGuard)
  @Get(':id')
  async getRoomById(@Param('id', ParseIntPipe) id: number) {
    return await this.roomsService.findRoomById(id);
  }

  @Auth(AuthType.Bearer)
  @UseGuards(RoomMemberGuard)
  @Post('/add-movie/:id')
  async addMovieToRoom(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddRoomMovieDto,
  ) {
    return await this.roomsService.addMovieToRoom(id, dto.dbId);
  }

  @Auth(AuthType.Bearer)
  @UseGuards(RoomMemberGuard)
  @Delete('/delete-movie/:id')
  async removeMovieFromRoom(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RemoveRoomMovieDto,
  ) {
    return await this.roomsService.deleteMovieFromRoom(id, dto.movieId);
  }

  @Auth(AuthType.Bearer)
  @UseGuards(RoomReadGuard)
  @Get(':roomId/rating')
  public getRoomRatings(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() query: GetRoomRatingDto,
  ) {
    return this.roomsService.getRoomRating(query, roomId);
  }
}
