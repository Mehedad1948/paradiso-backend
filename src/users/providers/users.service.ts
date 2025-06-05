import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from '../dtos/create-user.dto';
import { User } from '../user.entity';
import { CreateUserProvider } from './create-user.provider';
import { GetUserProvider } from './get-user.provider';
import { UpdateUserProvider } from './update-usrer.provider';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly createUserProvider: CreateUserProvider,

    private readonly getUserProvider: GetUserProvider,

    private readonly updateUserProvider: UpdateUserProvider,
  ) {}

  async createUser(createUserDto: CreateUserDto) {
    return await this.createUserProvider.createUser(createUserDto);
  }

  async updateUser(createUserDto: CreateUserDto) {
    return await this.createUserProvider.createUser(createUserDto);
  }

  async getUserByToken() {
    return await this.getUserProvider.getWithToken();
  }

  async findOneByEmail(email: string) {
    return await this.userRepository.findOne({
      where: { email },
      relations: ['role'],
    });
  }

  async getRatingUsers(): Promise<UserResponseDto[]> {
    try {
      const users = await this.userRepository
        .createQueryBuilder('user')
        .innerJoin('user.ratings', 'rating')
        .select(['user.id', 'user.username', 'user.avatar'])
        .distinct(true)
        .getMany();

      return plainToInstance(UserResponseDto, users, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      console.error('❌ Failed to get rating users:', error);
      throw new InternalServerErrorException('Failed to get rating users');
    }
  }

  public async findOneById(id: number) {
    let user: User | null = null;
    try {
      user = await this.userRepository.findOneBy({ id });
    } catch (error) {
      throw new RequestTimeoutException(
        'Unable to find user, please try again later',
        {
          description: 'Error connecting to the database',
          cause: error,
        },
      );
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  public async updateByEmail(email: string, data: User) {
    return await this.updateUserProvider.update(email, data);
  }

  public async updateById(id: number, data: UpdateUserDto) {
    return await this.updateUserProvider.updateById(id, data);
  }
}
