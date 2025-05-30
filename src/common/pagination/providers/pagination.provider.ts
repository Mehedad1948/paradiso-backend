import { Inject, Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../dtos/pagination-query.dto';
import { ObjectLiteral, Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { Paginated } from '../interfaces/paginated.interface';

@Injectable()
export class PaginationProvider {
  constructor(
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  public async paginateQuery<T extends ObjectLiteral>(
    paginationQuery: PaginationQueryDto,
    repository: Repository<T>,
  ): Promise<Paginated<T>> {
    // Since we have defaults in the DTO, we can safely assert these values
    const limit = paginationQuery.limit ?? 10;
    const page = paginationQuery.page ?? 1;

    const results = await repository.find({
      take: limit,
      skip: (page - 1) * limit,
    });

    const baseURL = this.request.protocol + '://' + this.request.host + '/';
    const newUrl = new URL(this.request.url, baseURL);

    const total = await repository.count();
    const totalPages = Math.ceil(total / limit);

    const nextPage = page + 1 <= totalPages ? page + 1 : page;
    const previousPage = page - 1 > 0 ? page - 1 : page;

    const finalResponse: Paginated<T> = {
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
    return finalResponse;
  }
}
