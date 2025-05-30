import { Body, Controller, Post } from '@nestjs/common';
import { GoogleTokenDto } from './dtos/google-token.dto';
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
  public authenticate(@Body() googleTokenDto: GoogleTokenDto) {
    // return this.googleAuthenticationService.authentication(googleTokenDto);
  }
}
