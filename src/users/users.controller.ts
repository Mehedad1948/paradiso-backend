import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './providers/users.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { RateLimit } from '../common/rate-limit/rate-limit.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Auth(AuthType.Bearer)
  async getCurrentUser() {
    return await this.usersService.getUserByToken();
  }

  @Patch('me')
  @Auth(AuthType.Bearer)
  async updateCurrentUser(@Body() updateUserDto: UpdateUserDto) {
    return this.usersService.updateCurrentUser(updateUserDto);
  }

  @Post()
  @Auth(AuthType.none)
  @RateLimit({
    name: 'sign-up',
    windowSeconds: 15 * 60,
    rules: [
      { by: 'email', limit: 5 },
      { by: 'ip', limit: 10 },
    ],
  })
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  @Put(':id')
  @Auth(AuthType.Bearer)
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateById(id, updateUserDto);
  }
}
