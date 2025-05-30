import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { RolesModule } from 'src/roles/roles.module';
import { CreateUserProvider } from './providers/create-user.provider';
import { UsersService } from './providers/users.service';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { GetUserProvider } from './providers/get-user.provider';
import { UpdateUserProvider } from './providers/update-usrer.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule),
    RolesModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    CreateUserProvider,
    GetUserProvider,
    UpdateUserProvider,
  ],
  exports: [UsersService],
})
export class UsersModule {}
