import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class LeaveRoomDto {
  // Keeping votes is the default so leaving never silently changes room results.
  @ApiPropertyOptional({
    default: false,
    description:
      'Also delete your movie ratings and your votes on open polls in this room',
  })
  @IsOptional()
  @IsBoolean()
  clearVotes?: boolean;
}
