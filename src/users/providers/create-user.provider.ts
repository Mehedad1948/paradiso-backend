import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from '../dtos/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user.entity';
import { Repository } from 'typeorm';
import { RoleService } from 'src/roles/providers/role.service';
import { HashingProvider } from 'src/auth/providers/hashing.provider';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from '../dtos/user-response.dto';

@Injectable()
export class CreateUserProvider {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly rolesService: RoleService,

    @Inject(forwardRef(() => HashingProvider))
    private readonly hashingProvider: HashingProvider,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const { email } = createUserDto;

    try {
      // Duplication check
      const existingUser = await this.userRepository.findOne({
        where: [{ email }],
      });

      if (existingUser) {
        throw new BadRequestException(
          'A user with the given email or username already exists',
        );
      }

      const defaultRole = await this.rolesService.findOneByName('user');
      if (!defaultRole) {
        throw new NotFoundException('Default "user" role not found');
      }

      const user = this.userRepository.create({
        ...createUserDto,
        password: await this.hashingProvider.hashPassword(
          createUserDto.password,
        ),
        role: defaultRole,
      });

      const savedUser = await this.userRepository.save(user);

      return plainToInstance(UserResponseDto, savedUser, {
        excludeExtraneousValues: true,
      }) as UserResponseDto;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      console.error('Error creating user:', error);
      throw new InternalServerErrorException('Failed to create user');
    }
  }
}
