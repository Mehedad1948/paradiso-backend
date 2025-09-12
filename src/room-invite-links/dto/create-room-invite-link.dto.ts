import { IsNumber } from 'class-validator';

export class CreateRoomInviteLinkDto {
  @IsNumber()
  roomId: number;
}
