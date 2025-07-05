import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';
import { RoomMemberGuard } from 'src/rooms/guards/RoomMember/roomMember.guard';
import { AddRatingDto } from './dtos/add-rating.dto';
import { GetRatingDto } from './dtos/get-rating.dto';
import { RatingsService } from './providers/ratings.service';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Auth(AuthType.Bearer)
  @UseGuards(RoomMemberGuard)
  @Post(':id')
  public async addRating(
    @Param('id') id: number,
    @Body() addRatingDto: AddRatingDto,
  ) {
    return await this.ratingsService.addRating(id, addRatingDto);
  }

  @Auth(AuthType.Bearer)
  @Get()
  public async getRatings(@Query() ratingQuery: GetRatingDto) {
    return await this.ratingsService.getAllRating(ratingQuery);
  }

  @Auth(AuthType.Bearer)
  @Get('movie/:id')
  public async getOneRating(@Param('id') id: string) {
    return await this.ratingsService.getOneRating(id);
  }
}
