import { BadRequestException, PipeTransform } from '@nestjs/common';

// TMDb IDs: plain positive integers, no signs, decimals or leading zeros.
export class PositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = Number(value);
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id))
      throw new BadRequestException('ID must be a positive integer');
    return id;
  }
}
