import { Body, Controller, Get, Post } from '@nestjs/common';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './providers/users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Auth(AuthType.Bearer)
  async getCurrentUser() {
    const result = await this.usersService.getUserByToken();
    console.log('🚀🚀🚀🚀', result);

    return result;
  }

  @Post()
  @Auth(AuthType.none)
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }
}
