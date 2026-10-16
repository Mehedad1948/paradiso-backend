import { ValidationPipe } from '@nestjs/common';
import { GetRoomRatingDto } from '../../rooms/dtos/get-room-ratings';
import { AddRoomMovieDto } from '../../rooms/dtos/room-movie.dto';
import { CreateMovieDto } from '../../movies/dtos/create-movie.dto';
import { CreateCustomMovieDto } from '../../movies/dtos/create-custom-movie.dto';

describe('Endpoint validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it('parses false, dates, pages, and numeric user IDs without truthiness coercion', async () => {
    const query = await pipe.transform(
      {
        isWatchTogether: 'false',
        page: '2',
        sortByUserId: '7',
        startDate: '2026-01-01',
      },
      { type: 'query', metatype: GetRoomRatingDto },
    );
    expect(query.isWatchTogether).toBe(false);
    expect(query.page).toBe(2);
    expect(query.sortByUserId).toBe(7);
    expect(query.startDate).toBeInstanceOf(Date);
  });
  it.each(['anything', '0', ['true', 'false']])(
    'rejects invalid boolean query values',
    async (value) => {
      await expect(
        pipe.transform(
          { isWatchTogether: value },
          { type: 'query', metatype: GetRoomRatingDto },
        ),
      ).rejects.toThrow();
    },
  );
  it('rejects invalid and oversized pagination', async () => {
    for (const limit of ['0', '101', '1.5', 'NaN']) {
      await expect(
        pipe.transform(
          { limit },
          { type: 'query', metatype: GetRoomRatingDto },
        ),
      ).rejects.toThrow();
    }
  });
  it('rejects a string movie ID in a numeric JSON body', async () => {
    await expect(
      pipe.transform(
        { dbId: '123' },
        { type: 'body', metatype: AddRoomMovieDto },
      ),
    ).rejects.toThrow();
  });
  it('validates nested genre objects instead of treating them as numbers', async () => {
    const body = {
      title: 'A movie',
      dbId: 1,
      genres: [{ id: 28, name: 'Action' }],
    };
    await expect(
      pipe.transform(body, { type: 'body', metatype: CreateMovieDto }),
    ).resolves.toMatchObject(body);
    await expect(
      pipe.transform(
        { ...body, genres: [{ id: -1 }] },
        { type: 'body', metatype: CreateMovieDto },
      ),
    ).rejects.toThrow();
  });
  it('accepts a custom movie with only a title and year', async () => {
    const custom = (body: object) =>
      pipe.transform(body, { type: 'body', metatype: CreateCustomMovieDto });
    await expect(
      custom({ title: '  Home Movie ', year: 2019 }),
    ).resolves.toEqual({ title: 'Home Movie', year: 2019 });
    await expect(
      custom({ title: 'Matrix', year: 1999, imdbLink: 'tt0133093' }),
    ).resolves.toMatchObject({
      imdbLink: 'https://www.imdb.com/title/tt0133093/',
    });
    await expect(
      custom({ title: 'Matrix', year: 1999, imdbLink: '' }),
    ).resolves.toEqual({ title: 'Matrix', year: 1999 });
    for (const bad of [
      { year: 1999 },
      { title: '   ', year: 1999 },
      { title: 'No year' },
      { title: 'Bad year', year: '1999' },
      { title: 'Bad year', year: 1500 },
      { title: 'Off-site', year: 1999, imdbLink: 'https://evil.test/tt1' },
      { title: 'Catalogue', year: 1999, dbId: 5 },
    ]) {
      await expect(custom(bad)).rejects.toThrow();
    }
  });
});
