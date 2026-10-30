import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

// Global so any feature can inject CacheService without wiring.
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
