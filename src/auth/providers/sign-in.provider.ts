import {
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SignInDto } from '../dtos/signin.dto';
import { GenerateTokensProvider } from './generate-tokens.provider';
import { HashingProvider } from './hashing.provider';
import { UsersService } from 'src/users/providers/users.service';
@Injectable()
export class SignInProvider {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly hashingProvider: HashingProvider,

    private readonly generateTokensProvider: GenerateTokensProvider,
  ) {}
  public async signIn(signInDto: SignInDto) {
    const user = await this.usersService.findOneByEmail(signInDto.email);
    console.log('❌✨✨✨', user);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    let isPasswordValid = false;
    try {
      isPasswordValid = await this.hashingProvider.comparePassword(
        signInDto.password,
        user.password || '',
      );
    } catch (error) {
      console.log(error);

      throw new UnauthorizedException('Invalid credentials');
    }
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return await this.generateTokensProvider.generateTokens(user);
  }
}
