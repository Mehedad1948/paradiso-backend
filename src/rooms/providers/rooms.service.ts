import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { UsersService } from 'src/users/providers/users.service';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';

@Injectable()
export class RoomsService {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,

    private readonly userService: UsersService,
  ) {}

  async createRoom(name: string): Promise<Room> {
    const userPayload = this.request[REQUEST_USER_KEY];

    const ownerId = userPayload?.sub;
    if (!ownerId) throw new Error('Invalid user');

    const owner = await this.userService.findOneById(ownerId);
    if (!owner) throw new Error('Owner not found');

    const room = this.roomRepository.create({
      name,
      users: [owner],
      movies: [],
      owner,
    });

    return await this.roomRepository.save(room);
  }
}
