import { Controller, Post } from '@nestjs/common';
import { GoogleAuthenticationService } from './providers/google-authentication.service';
import { Auth } from '../decorator/auth.decorator';
import { AuthType } from '../enums/auth.decorator';

@Auth(AuthType.none)
@Controller('auth/google-authentication')
export class GoogleAuthenticationController {
  constructor(
    private readonly googleAuthenticationService: GoogleAuthenticationService,
  ) {}

  @Post()
  public authenticate() {
    return this.googleAuthenticationService.authentication();
  }
}
