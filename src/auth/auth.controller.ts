import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Auth } from './decorator/auth.decorator';
import { IsAuthenticatedDto } from './dtos/isAuthenticated.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { SignInDto } from './dtos/signin.dto';
import { VerifyCodeDto } from './dtos/verify-code.dto';
import { AuthType } from './enums/auth.decorator';
import { AuthService } from './providers/auth.service';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { ForgetPasswordDto } from './dtos/forget-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Get('/:userId')
  public isAuthenticated(@Param() isAuthenticatedDto: IsAuthenticatedDto) {
    return isAuthenticatedDto.userId;
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @Auth(AuthType.none)
  public signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  @Post('refresh-tokens')
  @Auth(AuthType.none)
  public refreshTokens(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto);
  }

  @Auth(AuthType.none)
  @Post('verify-email')
  async verifyEmail(@Body() verifyCodeDto: VerifyCodeDto) {
    return await this.authService.verifyEmail(verifyCodeDto);
  }

  @Auth(AuthType.none)
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    console.log('➡️➡️➡️', resetPasswordDto);

    return await this.authService.resetPassword(resetPasswordDto);
  }

  @Auth(AuthType.none)
  @Post('forget-password')
  async forgetPassword(@Body() forgetPasswordDto: ForgetPasswordDto) {
    return await this.authService.forgetPassword(forgetPasswordDto);
  }
}
