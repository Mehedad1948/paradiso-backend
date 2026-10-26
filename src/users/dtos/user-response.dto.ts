// create-user.dto.ts
import { Expose, Transform, Type } from 'class-transformer';
import { GenreResponseDto } from '../../genres/dtos/genre-response.dto';
import { avatarOrNull } from '../avatar-url';

export class UserResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  username: string;

  @Expose()
  @Transform(({ value }): string | null | undefined =>
    value === undefined ? undefined : avatarOrNull(value),
  )
  avatar: string | null;

  @Expose({ name: 'role' })
  @Transform(({ obj }): string | undefined => {
    return obj.role?.name as string;
  })
  role: string;

  @Expose()
  @Type(() => GenreResponseDto)
  genres: GenreResponseDto[];

  @Expose()
  onboardedAt: Date | null;

  @Expose()
  roomInvitePolicy: 'everyone' | 'following' | 'nobody';
}
