import { Controller, Get } from '@nestjs/common';
import { AppService, HealthStatus } from './app.service';
import { Auth } from './auth/decorator/auth.decorator';
import { AuthType } from './auth/enums/auth.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Auth(AuthType.none)
  health(): Promise<HealthStatus> {
    return this.appService.getHealth();
  }
}
