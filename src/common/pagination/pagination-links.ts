import { Request } from 'express';

export function paginationLinks(
  request: Request,
  limit: number,
  page: number,
  totalPages: number,
) {
  const url = new URL(
    request.originalUrl ?? request.url,
    request.protocol + '://' + request.get('host'),
  );
  const link = (target: number) => {
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('page', String(target));
    return url.toString();
  };
  return {
    first: link(1),
    current: link(page),
    next: link(page < totalPages ? page + 1 : page),
    previous: link(page > 1 ? page - 1 : page),
    last: link(Math.max(1, totalPages)),
  };
}
