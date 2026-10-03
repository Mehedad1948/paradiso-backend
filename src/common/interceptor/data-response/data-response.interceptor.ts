import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { instanceToPlain } from 'class-transformer';
import { map, Observable } from 'rxjs';

@Injectable()
export class DataResponseInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}
  intercept<T>(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Record<string, unknown> & { apiVersion: string }> {
    return next.handle().pipe(
      map((data: T) => ({
        ...(Array.isArray(data) || data === null || typeof data !== 'object'
          ? { data: instanceToPlain(data) }
          : instanceToPlain(data)),
        apiVersion:
          this.configService.get<string>('appConfig.apiVersion') ?? '',
      })),
    );
  }
}
