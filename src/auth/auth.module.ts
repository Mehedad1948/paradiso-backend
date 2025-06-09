import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from 'src/mail/mail.module';
import { UsersModule } from 'src/users/users.module';
import { AuthController } from './auth.controller';
import jwtConfig from './config/jwt.config';
import { AuthService } from './providers/auth.service';
import { BcryptProvider } from './providers/bcrypt.provider';
import { ForgetPasswordProvider } from './providers/forget-password.provider';
import { GenerateTokensProvider } from './providers/generate-tokens.provider';
import { HashingProvider } from './providers/hashing.provider';
import { RefreshTokensProvider } from './providers/refresh-tokens.provider';
import { ResetPasswordProvider } from './providers/reset-password.provider';
import { SignInProvider } from './providers/sign-in.provider';
import { VerifyEmailProvider } from './providers/verify-email.provider';
import { GoogleAuthenticationController } from './social/google-authentication.controller';
import { GoogleAuthenticationService } from './social/providers/google-authentication.service';
@Module({
  controllers: [AuthController, GoogleAuthenticationController],
  providers: [
    AuthService,
    { provide: HashingProvider, useClass: BcryptProvider },
    SignInProvider,
    GenerateTokensProvider,
    RefreshTokensProvider,
    GoogleAuthenticationService,
    VerifyEmailProvider,
    ForgetPasswordProvider,
    ResetPasswordProvider,
  ],
  imports: [
    forwardRef(() => UsersModule),
    ConfigModule.forFeature(jwtConfig),
    MailModule,
    JwtModule.registerAsync(jwtConfig.asProvider()),
  ],
  exports: [AuthService, HashingProvider],
})
export class AuthModule {}
