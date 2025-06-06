import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { UsersService } from 'src/users/providers/users.service';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from 'src/users/dtos/user-response.dto';

@Injectable()
export class RoomsService {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,

    private readonly userService: UsersService,
  ) {}

  async createRoom(name: string) {
    try {
      const userPayload = this.request[REQUEST_USER_KEY];
      const ownerId = userPayload?.sub;

      if (!ownerId) {
        throw new UnauthorizedException('Invalid user');
      }

      const owner = await this.userService.findOneById(ownerId);
      if (!owner) {
        throw new NotFoundException('Owner not found');
      }

      const existingRoom = await this.roomRepository.findOne({
        where: { name },
      });
      if (existingRoom) {
        throw new ConflictException(`Room with name "${name}" already exists`);
      }

      const room = this.roomRepository.create({
        name,
        users: [owner],
        movies: [],
        owner,
      });

      await this.roomRepository.save(room);

      return {
        message: 'Room created successfully',
        name: room.name,
        image: room.image,
        isPublic: room.isPublic,
        owner: plainToInstance(UserResponseDto, room.owner, {
          excludeExtraneousValues: true,
        }),
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error; // rethrow known exceptions
      }
      // fallback for unexpected errors
      throw new InternalServerErrorException('Failed to create room');
    }
  }
}
