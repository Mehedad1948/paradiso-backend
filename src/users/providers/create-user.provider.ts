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
import { HashingProvider } from '../../auth/providers/hashing.provider';
import { MailService } from '../../mail/providers/mail.service';
import { RoleService } from '../../roles/providers/role.service';
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
    const { email } = createUserDto;

    try {
      // Duplication check: only email must be unique, usernames may repeat
      const existingUser = await this.userRepository
        .createQueryBuilder('user')
        .where('LOWER(user.email) = :email', {
          email: email.trim().toLowerCase(),
        })
        .getOne();

      if (existingUser && !existingUser.isEmailVerified) {
        // Never overwrite the pending account's password here: only someone
        // who can read the inbox may take it over (via verify or reset).
        existingUser.verificationCode = Math.floor(
          1000 + Math.random() * 9000,
        ).toString();
        existingUser.verificationCodeExpiresAt = new Date(
          Date.now() + 60 * 60 * 1000,
        );
        await this.userRepository.update(
          { id: existingUser.id },
          {
            verificationCode: existingUser.verificationCode,
            verificationCodeExpiresAt: existingUser.verificationCodeExpiresAt,
          },
        );
        await this.mailService.sendVerificationEmail(existingUser);

        throw new BadRequestException(
          'This email is registered but not verified. A new verification code has been sent; verify it or use forgot password to set a new password.',
        );
      }

      if (existingUser) {
        throw new BadRequestException(
          'A user with the given email already exists',
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

      await this.mailService.sendVerificationEmail(user);

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
