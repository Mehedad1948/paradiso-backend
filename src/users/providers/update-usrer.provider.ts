import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { HashingProvider } from '../../auth/providers/hashing.provider';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { plainToInstance } from 'class-transformer';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';

@Injectable()
export class UpdateUserProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => HashingProvider))
    private readonly hashing: HashingProvider,
  ) {}

  async update(email: string, data: Partial<User>): Promise<User | null> {
    await this.userRepository.update({ email }, data);
    return this.userRepository.findOneBy({ email });
  }

  async updateById(
    id: number,
    data: UpdateUserDto,
  ): Promise<UserResponseDto | null> {
    const userPayload = this.request[REQUEST_USER_KEY];

    const isOwner = userPayload.sub === id;
    const isAdmin = userPayload.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You are not authorized to update this user.',
      );
    }

    const changes = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as UpdateUserDto;
    if (!Object.keys(changes).length)
      throw new BadRequestException('Provide at least one field to update');
    if (changes.password !== undefined)
      changes.password = await this.hashing.hashPassword(changes.password);
    const result = await this.userRepository.update({ id }, changes);
    if (!result.affected) throw new NotFoundException('User not found');

    const updatedUser = await this.userRepository.findOneBy({ id });
    return plainToInstance(UserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }
}
