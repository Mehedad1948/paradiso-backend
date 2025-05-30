import { Body, Controller, Post } from '@nestjs/common';
import { CreateRoleDto } from './dtos/create-role.dto';
import { RoleService } from './providers/role.service';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly roleServices: RoleService) {}

  @Post()
  @Auth(AuthType.none)
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.roleServices.create(createRoleDto);
  }
}
