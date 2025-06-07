import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class InviteUserToRoomDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
