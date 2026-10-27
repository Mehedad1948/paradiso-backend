import { Inject, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Request } from 'express';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { Repository } from 'typeorm';
import { UserResponseDto } from '../dtos/user-response.dto';
import { User } from '../user.entity';
import { UserStatsProvider } from './user-stats.provider';

export class GetUserProvider {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly jwtService: JwtService,
    private readonly userStats: UserStatsProvider,
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  async getWithToken(): Promise<UserResponseDto> {
    const profile = await this.findCurrent();
    // Outside findCurrent so a failed count is a 500, not a 401.
    profile.stats = await this.userStats.forUser(profile.id);
    return profile;
  }

  private async findCurrent(): Promise<UserResponseDto> {
    try {
      // Verify and decode JWT token
      const payload = this.request[REQUEST_USER_KEY];

      if (!payload) {
        throw new UnauthorizedException('User payload not found');
      }
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['role', 'genres'],
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return plainToInstance(UserResponseDto, user, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      console.log(error);

      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
