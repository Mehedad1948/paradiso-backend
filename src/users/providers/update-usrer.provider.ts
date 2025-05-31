import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { plainToInstance } from 'class-transformer';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';

@Injectable()
export class UpdateUserProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

    await this.userRepository.update({ id }, data);

    const updatedUser = await this.userRepository.findOneBy({ id });
    return plainToInstance(UserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }
}
