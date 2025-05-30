import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { CreateUserDto } from '../dtos/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createUser(createUserDto: CreateUserDto) {
    const createdUser = this.userRepository.create(createUserDto);
  }

  async findOneByEmail(email: string) {
    return await this.userRepository.findOneBy({ email });
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
}
