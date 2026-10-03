import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './providers/users.service';
import { UpdateUserDto } from './dtos/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Auth(AuthType.Bearer)
  async getCurrentUser() {
    return await this.usersService.getUserByToken();
  }

  @Post()
  @Auth(AuthType.none)
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
