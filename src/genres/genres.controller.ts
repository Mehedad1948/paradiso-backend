import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UpdateGenreDto } from './dtos/update-genre.dto';
import { GenresService } from './providers/genres.service';
import { Roles } from '../auth/decorator/roles.decorator';

@Controller('genres')
export class GenresController {
  constructor(private readonly genresService: GenresService) {}

  @Post()
  @Roles('admin')
  async create() {
    return this.genresService.create();
  }

  @Get()
  async findAll() {
    return this.genresService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.genresService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGenreDto: UpdateGenreDto,
  ) {
    return this.genresService.update(id, updateGenreDto);
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.genresService.delete(id);
  }
}
