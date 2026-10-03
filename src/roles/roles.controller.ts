import { Body, Controller, Post } from '@nestjs/common';
import { CreateRoleDto } from './dtos/create-role.dto';
import { RoleService } from './providers/role.service';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { Roles } from '../auth/decorator/roles.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly roleServices: RoleService) {}

  @Post()
  @Auth(AuthType.Bearer)
  @Roles('admin')
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.roleServices.create(createRoleDto);
  }
}
