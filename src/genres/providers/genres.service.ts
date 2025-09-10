import { Injectable, NotFoundException } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { Genre } from '../genre.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class GenresService {
  constructor(
    @InjectRepository(Genre)
    private readonly genresRepository: Repository<Genre>,
  ) {}

  async create() {
    const res = await fetch(
      `https://api.themoviedb.org/3/genre/movie/list?api_key=ac8fc21d9289e79bd52cf5261b9b4931&language=en-US`,
    );
    const data = await res.json();
    const newGenres = data.genres;
    const formattedGenres = newGenres.map((item) => ({
      tmdbId: item.id,
      name: item.name,
    }));

    const genreEntities = this.genresRepository.create(formattedGenres);

    // Save them to the database
    return await this.genresRepository.save(genreEntities);
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
