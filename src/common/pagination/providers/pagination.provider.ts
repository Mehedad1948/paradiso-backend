import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { paginationLinks } from '../pagination-links';
import { PaginationQueryDto } from '../dtos/pagination-query.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Paginated } from '../interfaces/paginated.interface';

@Injectable()
export class PaginationProvider {
  constructor(
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  public async paginateQuery<T extends ObjectLiteral>(
    paginationQuery: PaginationQueryDto,
    queryBuilder: SelectQueryBuilder<T>,
  ): Promise<Paginated<T>> {
    const limit = paginationQuery.limit ?? 10;
    const page = paginationQuery.page ?? 1;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1000000
    ) {
      throw new BadRequestException('Invalid pagination');
    }

    const [results, total] = await queryBuilder
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    return {
      data: results,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
      links: paginationLinks(this.request, limit, page, totalPages),
    };
  }
}
