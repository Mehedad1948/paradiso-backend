import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, MaxLength } from 'class-validator';
export class AcceptInvitationDto {
  @ApiProperty({ type: String, maxLength: 4096 })
  @IsJWT()
  @MaxLength(4096)
  token: string;
}
