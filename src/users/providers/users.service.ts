import {
  Injectable,
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
