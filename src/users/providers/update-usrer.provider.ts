import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HashingProvider } from '../../auth/providers/hashing.provider';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User } from '../user.entity';
import { Genre } from '../../genres/genre.entity';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { plainToInstance } from 'class-transformer';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { ActiveUserData } from '../../auth/interfaces/active-user-data.interface';
import { isOwnAvatarUrl } from '../avatar-url';

export const USER_PROFILE_RELATIONS = ['role', 'genres'];

@Injectable()
export class UpdateUserProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => HashingProvider))
    private readonly hashing: HashingProvider,
    private readonly config: ConfigService,
  ) {}

  async update(email: string, data: Partial<User>): Promise<User | null> {
    await this.userRepository.update({ email }, data);
    return this.userRepository.findOneBy({ email });
  }

  async updateCurrent(data: UpdateUserDto): Promise<UserResponseDto | null> {
    const { sub } = this.request[REQUEST_USER_KEY] as ActiveUserData;
    return this.updateById(sub, data);
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

    const { genreIds, onboarded, ...rest } = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as UpdateUserDto;
    const changes: Partial<
      Pick<User, 'password' | 'username' | 'avatar' | 'roomInvitePolicy'>
    > = rest;
    if (
      !Object.keys(changes).length &&
      genreIds === undefined &&
      onboarded === undefined
    )
      throw new BadRequestException('Provide at least one field to update');
    if (typeof changes.avatar === 'string')
      this.assertOwnAvatar(changes.avatar);
    if (changes.password !== undefined)
      changes.password = await this.hashing.hashPassword(changes.password);

    await this.userRepository.manager.transaction(async (manager) => {
      let genres: Genre[] | undefined;
      if (genreIds !== undefined) {
        genres = genreIds.length
          ? await manager.find(Genre, { where: { id: In(genreIds) } })
          : [];
        const found = new Set(genres.map((genre) => genre.id));
        const unknown = genreIds.filter((genreId) => !found.has(genreId));
        if (unknown.length)
          throw new BadRequestException(
            `Unknown genre ID(s): ${unknown.join(', ')}`,
          );
      }
      if (Object.keys(changes).length) {
        const result = await manager.update(User, { id }, changes);
        if (!result.affected) throw new NotFoundException('User not found');
      } else if (!(await manager.existsBy(User, { id }))) {
        throw new NotFoundException('User not found');
      }
      if (genres) {
        const relation = manager.createQueryBuilder().relation(User, 'genres');
        const current = (await relation.of(id).loadMany<Genre>()).map(
          (genre) => genre.id,
        );
        const next = genres.map((genre) => genre.id);
        await relation.of(id).addAndRemove(
          next.filter((genreId) => !current.includes(genreId)),
          current.filter((genreId) => !next.includes(genreId)),
        );
      }
      // Only the first completion counts; later calls keep the original time.
      if (onboarded)
        await manager.update(
          User,
          { id, onboardedAt: IsNull() },
          { onboardedAt: new Date() },
        );
    });

    const updatedUser = await this.userRepository.findOne({
      where: { id },
      relations: USER_PROFILE_RELATIONS,
    });
    return plainToInstance(UserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }

  private assertOwnAvatar(avatar: string) {
    const publicBase = this.config.get<string>('appConfig.r2PublicUrl');
    if (!publicBase || !isOwnAvatarUrl(avatar, publicBase))
      throw new BadRequestException(
        'avatar must be an https URL returned by POST /uploads/file with folder=avatars',
      );
  }
}
