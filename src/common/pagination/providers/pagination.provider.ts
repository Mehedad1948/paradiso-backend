import { Inject, Injectable } from '@nestjs/common';
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

    const [results, total] = await queryBuilder
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    const baseURL = this.request.protocol + '://' + this.request.get('host');
    const newUrl = new URL(this.request.url, baseURL);

    const nextPage = page + 1 <= totalPages ? page + 1 : page;
    const previousPage = page - 1 > 0 ? page - 1 : page;

    return {
      data: results,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
      links: {
        first: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=1`,
        current: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=${page}`,
        next: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=${nextPage}`,
        previous: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=${previousPage}`,
        last: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=${totalPages}`,
      },
    };
  }
}
