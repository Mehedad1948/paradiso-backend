import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Genre } from '../genre.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class GenresService {
  constructor(
    @InjectRepository(Genre)
    private readonly genresRepository: Repository<Genre>,
  ) {}

  async create(genre: Partial<Genre>): Promise<Genre> {
    const newGenre = this.genresRepository.create(genre);
    return await this.genresRepository.save(newGenre);
  }

  async findAll(): Promise<Genre[]> {
    return await this.genresRepository.find();
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
