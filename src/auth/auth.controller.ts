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
import { ResendVerificationDto } from './dtos/resend-verification.dto';
import { RateLimit } from '../common/rate-limit/rate-limit.guard';

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
  @RateLimit({
    name: 'sign-in',
    windowSeconds: 15 * 60,
    rules: [
      { by: 'emailIp', limit: 8 },
      { by: 'email', limit: 60 },
      { by: 'ip', limit: 40 },
    ],
  })
  public signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  @Post('refresh-tokens')
  @Auth(AuthType.none)
  public refreshTokens(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto);
  }

  @Auth(AuthType.none)
  @RateLimit({
    name: 'verify-email',
    windowSeconds: 15 * 60,
    rules: [
      { by: 'email', limit: 10 },
      { by: 'ip', limit: 40 },
    ],
  })
  @Post('verify-email')
  async verifyEmail(@Body() verifyCodeDto: VerifyCodeDto) {
    return await this.authService.verifyEmail(verifyCodeDto);
  }

  @Auth(AuthType.none)
  @RateLimit({
    name: 'resend-verification',
    windowSeconds: 15 * 60,
    rules: [
      { by: 'email', limit: 3 },
      { by: 'ip', limit: 10 },
    ],
  })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body() resendVerificationDto: ResendVerificationDto,
  ) {
    return await this.authService.resendVerificationCode(resendVerificationDto);
  }

  @Auth(AuthType.none)
  @RateLimit({
    name: 'reset-password',
    windowSeconds: 15 * 60,
    rules: [
      { by: 'email', limit: 10 },
      { by: 'ip', limit: 40 },
    ],
  })
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return await this.authService.resetPassword(resetPasswordDto);
  }

  @Auth(AuthType.none)
  @RateLimit({
    name: 'forget-password',
    windowSeconds: 15 * 60,
    rules: [
      { by: 'email', limit: 3 },
      { by: 'ip', limit: 10 },
    ],
  })
  @Post('forget-password')
  async forgetPassword(@Body() forgetPasswordDto: ForgetPasswordDto) {
    return await this.authService.forgetPassword(forgetPasswordDto);
  }
}
