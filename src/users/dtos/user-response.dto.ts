// create-user.dto.ts
import { Expose, Transform } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  username: string;

  @Expose()
  verificationCode: string;

  @Expose({ name: 'role' })
  @Transform(({ obj }): string | undefined => {
    return obj.role?.name as string;
  })
  role: string;
}
