import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../role.entity';
import { CreateRoleDto } from '../dtos/create-role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async create({ name }: CreateRoleDto): Promise<Role> {
    try {
      // Check for duplicate role
      const existingRole = await this.roleRepository.findOne({
        where: { name },
      });
      if (existingRole) {
        throw new BadRequestException(`Role '${name}' already exists`);
      }

      const createdRole = this.roleRepository.create({ name });
      return await this.roleRepository.save(createdRole);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Otherwise, wrap unknown errors in an internal server error
      throw new InternalServerErrorException('Failed to create role');
    }
  }
}
