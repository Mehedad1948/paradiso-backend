import { Injectable, NotFoundException } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { Genre } from '../genre.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { MovieDbService } from '../../movies/providers/MovieDb.serviec';

@Injectable()
export class GenresService {
  constructor(
    @InjectRepository(Genre)
    private readonly genresRepository: Repository<Genre>,
    private readonly catalogue: MovieDbService,
  ) {}

  async create() {
    const newGenres = await this.catalogue.getGenres();
    const formattedGenres = newGenres.map((item) => ({
      tmdbId: item.id,
      name: item.name,
    }));

    if (formattedGenres.length)
      await this.genresRepository.upsert(formattedGenres, ['tmdbId']);
    return this.findAll();
  }

  async findAll(): Promise<Genre[]> {
    return await this.genresRepository.find();
  }

  async findGenresWithTmdbIds(tmdbIds: number[]): Promise<Genre[]> {
    return await this.genresRepository.find({
      where: {
        tmdbId: In(tmdbIds),
      },
    });
  }

  async findOne(id: string): Promise<Genre> {
    const genre = await this.genresRepository.findOne({ where: { id } });
    if (!genre) {
      throw new NotFoundException(`Genre with id ${id} not found`);
    }
    return genre;
  }

  async update(id: string, updatedData: Partial<Genre>): Promise<Genre> {
    const genre = await this.findOne(id);
    const updated = Object.assign(genre, updatedData);
    return await this.genresRepository.save(updated);
  }

  async delete(id: string): Promise<void> {
    const result = await this.genresRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Genre with id ${id} not found`);
    }
  }
}
