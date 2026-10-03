import { ValidationPipe } from '@nestjs/common';
import { GetRoomRatingDto } from '../../rooms/dtos/get-room-ratings';
import { AddRoomMovieDto } from '../../rooms/dtos/room-movie.dto';
import { CreateMovieDto } from '../../movies/dtos/create-movie.dto';

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
});
