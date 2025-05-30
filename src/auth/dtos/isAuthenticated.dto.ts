import { IsString } from 'class-validator';

export class IsAuthenticatedDto {
  @IsString()
  userId: string;
}
