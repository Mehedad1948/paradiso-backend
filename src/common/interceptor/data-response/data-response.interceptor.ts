import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { map, Observable } from 'rxjs';

@Injectable()
export class DataResponseInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}
  intercept<T>(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<T & { apiVersion: string }> {
    return next.handle().pipe(
      map((data: T) => ({
        ...data,
        apiVersion:
          this.configService.get<string>('appConfig.apiVersion') ?? '',
      })),
    );
  }
}
