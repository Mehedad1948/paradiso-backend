import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { UpdateRoomDto } from './dtos/update-room.dto';
import { BanRoomUserDto } from './dtos/ban-room-user.dto';
import { LeaveRoomDto } from './dtos/leave-room.dto';
import { CreateCustomMovieDto } from '../movies/dtos/create-custom-movie.dto';

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
  @Patch(':id')
  async updateRoom(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoomDto: UpdateRoomDto,
  ) {
    return await this.roomsService.updateRoom(id, updateRoomDto);
  }

  @Auth(AuthType.Bearer)
  @UseGuards(RoomMemberGuard)
  @Post('/add-movie/:id')
  async addMovieToRoom(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddRoomMovieDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.roomsService.addMovieToRoom(
      id,
      user.sub,
      dto.dbId,
      dto.isWatchedTogether ?? false,
    );
  }

  // For movies missing from TMDb: only title and year are required.
  @Auth(AuthType.Bearer)
  @UseGuards(RoomMemberGuard)
  @Post('/add-custom-movie/:id')
  async addCustomMovieToRoom(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCustomMovieDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.roomsService.addCustomMovieToRoom(id, user.sub, dto);
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
  @Post(':id/leave')
  async leaveRoom(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LeaveRoomDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.roomsService.leaveRoom(id, user.sub, dto.clearVotes);
  }

  // Moderation endpoints are owner-only; the provider enforces ownership.
  @Auth(AuthType.Bearer)
  @Delete(':id/members/:userId')
  async kickUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.roomsService.kickUser(id, user.sub, userId);
  }

  @Auth(AuthType.Bearer)
  @Get(':id/bans')
  async getRoomBans(
    @Param('id', ParseIntPipe) id: number,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.roomsService.getRoomBans(id, user.sub);
  }

  @Auth(AuthType.Bearer)
  @Post(':id/bans')
  async banUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BanRoomUserDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.roomsService.banUser(
      id,
      user.sub,
      dto.userId,
      dto.reason,
    );
  }

  @Auth(AuthType.Bearer)
  @Delete(':id/bans/:userId')
  async unbanUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.roomsService.unbanUser(id, user.sub, userId);
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

  // Unfiltered counts for the logged-in user, independent of table filters.
  @Auth(AuthType.Bearer)
  @UseGuards(RoomReadGuard)
  @Get(':roomId/rating/summary')
  public getRoomRatingSummary(@Param('roomId', ParseIntPipe) roomId: number) {
    return this.roomsService.getRoomUnratedSummary(roomId);
  }
}
