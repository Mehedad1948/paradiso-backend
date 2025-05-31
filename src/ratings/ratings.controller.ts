import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RatingsService } from './providers/ratings.service';
import { AddRatingDto } from './dtos/add-rating.dto';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Auth(AuthType.Bearer)
  @Post(':id')
  public async addRating(
    @Param('id') id: string,
    @Body() addRatingDto: AddRatingDto,
  ) {
    return await this.ratingsService.addRating(id, addRatingDto);
  }

  @Auth(AuthType.Bearer)
  @Get()
  public async getRatings() {
    return await this.ratingsService.getAllRating();
  }

  @Auth(AuthType.Bearer)
  @Get(':id')
  public async getOneRating(@Param('id') id: string) {
    return await this.ratingsService.getOneRating(id);
  }
}
