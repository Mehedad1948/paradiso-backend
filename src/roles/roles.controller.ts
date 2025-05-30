import { Body, Controller, Post } from '@nestjs/common';
import { CreateRoleDto } from './dtos/create-role.dto';
import { RoleService } from './providers/role.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roleServices: RoleService) {}
  @Post()
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.roleServices.create(createRoleDto);
  }
}
