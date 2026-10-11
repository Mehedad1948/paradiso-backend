import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { UpdateRoomDto } from '../dtos/update-room.dto';
import { Room } from '../room.entity';
import { RoomAccessService } from './room-access.service';
import { lockRoom } from './room-transaction';

@Injectable()
export class UpdateRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
    private readonly access: RoomAccessService,
  ) {}

  async updateRoom(roomId: number, dto: UpdateRoomDto) {
    await this.access.requireOwner(
      roomId,
      this.request[REQUEST_USER_KEY]?.sub,
      'Only the room owner can edit this room',
    );
    try {
      await this.roomRepository.manager.transaction(async (manager) => {
        const room = await lockRoom(manager, roomId);
        if (typeof dto.name === 'string' && dto.name !== room.name) {
          const taken = await manager
            .getRepository(Room)
            .exists({ where: { name: dto.name } });
          if (taken)
            throw new ConflictException(
              `Room with name "${dto.name}" already exists`,
            );
          room.name = dto.name;
        }
        // null clears description/image/themeColor; undefined leaves them untouched
        if (dto.description !== undefined) room.description = dto.description;
        if (dto.image !== undefined) room.image = dto.image;
        if (typeof dto.isPublic === 'boolean') room.isPublic = dto.isPublic;
        if (dto.themeColor !== undefined) room.themeColor = dto.themeColor;
        await manager.getRepository(Room).save(room);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException('Room name already exists');
      throw error;
    }
  }
}
