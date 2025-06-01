import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { HashingProvider } from 'src/auth/providers/hashing.provider';
import { MailService } from 'src/mail/providers/mail.service';
import { RoleService } from 'src/roles/providers/role.service';
import { Repository } from 'typeorm';
import { CreateUserDto } from '../dtos/create-user.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { User } from '../user.entity';

@Injectable()
export class CreateUserProvider {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly rolesService: RoleService,

    @Inject(forwardRef(() => HashingProvider))
    private readonly hashingProvider: HashingProvider,

    private readonly mailService: MailService,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const { email, username } = createUserDto;

    try {
      // Duplication check
      const existingUser = await this.userRepository.findOne({
        where: [{ email }, { username }],
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
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const user = this.userRepository.create({
        ...createUserDto,
        password: await this.hashingProvider.hashPassword(
          createUserDto.password,
        ),
        role: defaultRole,
        verificationCode: code,
        verificationCodeExpiresAt: expiresAt,
      });

      try {
        await this.mailService.sendVerificationEmail(user);
      } catch (error) {
        console.log('❌❌❌ Failed to send welcome error', error);
      }

      const savedUser = await this.userRepository.save(user);

      return plainToInstance(UserResponseDto, savedUser, {
        excludeExtraneousValues: true,
      });
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
