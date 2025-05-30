import { Module } from '@nestjs/common';
import { PaginationProvider } from '../providers/pagination.provider';

@Module({
  controllers: [],
  providers: [PaginationProvider],
  exports: [PaginationProvider],
  imports: [],
})
export class PaginationModule {}
