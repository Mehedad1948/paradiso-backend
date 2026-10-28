import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Movie } from '../movie.entity';
import { CAST_LIMIT, toMovieExtras } from '../tmdb-extras';
import { MovieDetailsProvider } from './movie-details.provider';
import { MovieDbService, TmdbMovieWithExtras } from './MovieDb.serviec';

const tmdb = (extra: Partial<TmdbMovieWithExtras> = {}) =>
  ({
    id: 603,
    title: 'The Matrix',
    overview: 'A hacker learns the truth.',
    runtime: 136,
    tagline: 'Welcome to the Real World.',
    backdrop_path: '/backdrop.jpg',
    genres: [],
    credits: {
      cast: Array.from({ length: 20 }, (_, index) => ({
        name: 'Actor ' + index,
        character: index ? 'Role ' + index : '',
        profile_path: index ? '/p' + index + '.jpg' : undefined,
      })),
      crew: [
        { name: 'Lana Wachowski', job: 'Director' },
        { name: 'Lilly Wachowski', job: 'Director' },
        { name: 'Lana Wachowski', job: 'Director' },
        { name: 'Joel Silver', job: 'Producer' },
      ],
    },
    videos: {
      results: [
        { key: 'teaser', site: 'YouTube', type: 'Teaser', official: true },
        { key: 'fan', site: 'YouTube', type: 'Trailer', official: false },
        { key: 'vimeo', site: 'Vimeo', type: 'Trailer', official: true },
        { key: 'official', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    ...extra,
  }) as TmdbMovieWithExtras;

describe('toMovieExtras', () => {
  it('keeps only what the details screen shows', () => {
    const extras = toMovieExtras(tmdb());
    expect(extras).toMatchObject({
      runtime: 136,
      tagline: 'Welcome to the Real World.',
      backdrop_path: '/backdrop.jpg',
      director: 'Lana Wachowski, Lilly Wachowski',
      trailerKey: 'official',
    });
    expect(extras.cast).toHaveLength(CAST_LIMIT);
    expect(extras.cast![0]).toEqual({
      name: 'Actor 0',
      character: null,
      profile_path: null,
    });
    expect(extras.detailsFetchedAt).toBeInstanceOf(Date);
  });

  it('falls back to a teaser when a film has no trailer', () => {
    const extras = toMovieExtras(
      tmdb({
        videos: {
          results: [
            { key: 'clip', site: 'YouTube', type: 'Clip', official: true },
            { key: 'teaser', site: 'YouTube', type: 'Teaser' },
          ],
        },
      }),
    );
    expect(extras.trailerKey).toBe('teaser');
  });

  it('stores nulls rather than empty values for missing data', () => {
    expect(
      toMovieExtras(
        tmdb({
          runtime: 0,
          tagline: '',
          credits: undefined,
          videos: undefined,
        }),
      ),
    ).toMatchObject({
      runtime: null,
      tagline: null,
      director: null,
      cast: [],
      trailerKey: null,
    });
  });
});

describe('MovieDetailsProvider', () => {
  let row: Partial<Movie>;
  let repository: { createQueryBuilder: jest.Mock; update: jest.Mock };
  let catalogue: { getMovieDetailsWithExtras: jest.Mock };
  let provider: MovieDetailsProvider;

  beforeEach(() => {
    row = {
      id: 'movie-1',
      dbId: 603,
      title: 'The Matrix',
      overview: null as unknown as string,
      runtime: null,
      detailsFetchedAt: null,
      genres: [{ id: 'g1', name: 'Action', tmdbId: 28, movies: [] }],
    };
    const query = {
      leftJoin: () => query,
      select: () => query,
      where: () => query,
      getOne: jest.fn(() => Promise.resolve(row ? { ...row } : null)),
    };
    repository = {
      createQueryBuilder: jest.fn(() => query),
      update: jest.fn((_id: string, values: Partial<Movie>) => {
        row = { ...row, ...values };
        return Promise.resolve();
      }),
    };
    catalogue = {
      getMovieDetailsWithExtras: jest.fn(() => Promise.resolve(tmdb())),
    };
    provider = new MovieDetailsProvider(
      repository as unknown as Repository<Movie>,
      catalogue as unknown as MovieDbService,
    );
  });

  it('fills a catalogue movie from TMDb on first view only', async () => {
    const first = await provider.getDetails('movie-1');
    expect(first.complete).toBe(true);
    expect(first.details).toMatchObject({
      runtime: 136,
      overview: 'A hacker learns the truth.',
      director: 'Lana Wachowski, Lilly Wachowski',
      genres: [{ id: 'g1', name: 'Action', tmdbId: 28 }],
    });
    expect(first.details).not.toHaveProperty('detailsFetchedAt');
    await provider.getDetails('movie-1');
    expect(catalogue.getMovieDetailsWithExtras).toHaveBeenCalledTimes(1);
  });

  it('keeps an overview a user already wrote', async () => {
    row.overview = 'Our own summary';
    const { details } = await provider.getDetails('movie-1');
    expect(details.overview).toBe('Our own summary');
  });

  it('shares one catalogue request between concurrent first views', async () => {
    await Promise.all([
      provider.getDetails('movie-1'),
      provider.getDetails('movie-1'),
      provider.getDetails('movie-1'),
    ]);
    expect(catalogue.getMovieDetailsWithExtras).toHaveBeenCalledTimes(1);
  });

  it('serves stored data uncached when the catalogue is down, then retries', async () => {
    catalogue.getMovieDetailsWithExtras.mockRejectedValueOnce(
      new ServiceUnavailableException(),
    );
    const failed = await provider.getDetails('movie-1');
    expect(failed.complete).toBe(false);
    expect(failed.details).toMatchObject({ title: 'The Matrix', cast: [] });
    expect((await provider.getDetails('movie-1')).details.runtime).toBe(136);
  });

  it('stops asking TMDb for an ID it no longer knows', async () => {
    catalogue.getMovieDetailsWithExtras.mockRejectedValue(
      new NotFoundException(),
    );
    expect((await provider.getDetails('movie-1')).complete).toBe(true);
    await provider.getDetails('movie-1');
    expect(catalogue.getMovieDetailsWithExtras).toHaveBeenCalledTimes(1);
  });

  it('never calls TMDb for manually entered movies', async () => {
    row.dbId = null;
    expect((await provider.getDetails('movie-1')).complete).toBe(true);
    expect(catalogue.getMovieDetailsWithExtras).not.toHaveBeenCalled();
  });

  it('reports unknown movies as not found', async () => {
    row = undefined as unknown as Partial<Movie>;
    await expect(provider.getDetails('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
