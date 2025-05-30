import { Injectable } from '@nestjs/common';
import { HashingProvider } from './hashing.provider';
import * as bcrypt from 'bcrypt';

@Injectable()
export class BcryptProvider implements HashingProvider {
  async hashPassword(password: string | Buffer): Promise<string> {
    const salt = await bcrypt.genSalt();
    try {
      return (await bcrypt.hash(password, salt)) as string;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to hash password: ${error.message}`);
      }
      throw new Error('Failed to hash password: Unknown error');
    }
  }

  async comparePassword(
    password: string | Buffer,
    hash: string,
  ): Promise<boolean> {
    try {
      return (await bcrypt.compare(password, hash)) as boolean;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to compare password: ${error.message}`);
      }
      throw new Error('Failed to compare password: Unknown error');
    }
  }
}
