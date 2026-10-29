import { ValidationPipe } from '@nestjs/common';
import { GetMovieDto } from './dtos/get-movie.dto';
import { escapeLike } from './escape-like';

describe('GET /movies search', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const parse = (query: object) =>
    pipe.transform(query, { type: 'query', metatype: GetMovieDto });

  it('trims the text and keeps pagination and date filters beside it', async () => {
    const query = await parse({
      search: '  blade runner ',
      page: '2',
      limit: '5',
      startDate: '2026-01-01',
    });
    expect(query).toMatchObject({ search: 'blade runner', page: 2, limit: 5 });
    expect(query.startDate).toBeInstanceOf(Date);
  });

  it('ignores a blank search', async () => {
    expect((await parse({ search: '   ' })).search).toBeUndefined();
    expect((await parse({})).search).toBeUndefined();
  });

  it('limits the search to 100 characters', async () => {
    await expect(parse({ search: 'x'.repeat(100) })).resolves.toBeDefined();
    await expect(parse({ search: 'x'.repeat(101) })).rejects.toThrow();
  });

  it('rejects a repeated search parameter', async () => {
    await expect(parse({ search: ['a', 'b'] })).rejects.toThrow();
  });

  it('matches LIKE wildcards literally', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c:\\dir')).toBe('c:\\\\dir');
    expect(escapeLike("Ocean's Eleven")).toBe("Ocean's Eleven");
  });
});
