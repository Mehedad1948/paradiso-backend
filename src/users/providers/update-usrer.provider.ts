import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';

@Injectable()
export class UpdateUserProvider {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async update(email: string, data: Partial<User>): Promise<User | null> {
    await this.userRepository.update({ email }, data);
    return this.userRepository.findOneBy({ email });
  }
}
