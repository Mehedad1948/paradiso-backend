import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Movie } from '../movie.entity';
import {
  BACKDROP_LIMIT,
  CAST_LIMIT,
  DETAILS_VERSION,
  toMovieExtras,
} from '../tmdb-extras';
import {
  EMPTY_GALLERY_RETRY_MS,
  isOutdated,
  MovieDetailsProvider,
} from './movie-details.provider';
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
        id: 100 + index,
        name: 'Actor ' + index,
        character: index ? 'Role ' + index : '',
        profile_path: index ? '/p' + index + '.jpg' : undefined,
      })),
      crew: [
        { id: 9339, name: 'Lana Wachowski', job: 'Director' },
        {
          id: 9340,
          name: 'Lilly Wachowski',
          job: 'Director',
          profile_path: '/lilly.jpg',
        },
        { id: 9339, name: 'Lana Wachowski', job: 'Director' },
        { id: 9339, name: 'Lana Wachowski', job: 'Writer' },
        {
          id: 9340,
          name: 'Lilly Wachowski',
          job: 'Writer',
          profile_path: '/lilly.jpg',
        },
        { id: 9339, name: 'Lana Wachowski', job: 'Writer' },
        { id: 1, name: 'Bill Pope', job: 'Director of Photography' },
        { id: 2, name: 'Don Davis', job: 'Original Music Composer' },
        { id: 3, name: 'Joel Silver', job: 'Producer' },
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
    images: {
      backdrops: [
        { file_path: '/titled.jpg', iso_639_1: 'en', vote_average: 9 },
        { file_path: '/low.jpg', iso_639_1: null, vote_average: 4 },
        { file_path: '/backdrop.jpg', iso_639_1: null, vote_average: 5 },
        { file_path: '/high.jpg', iso_639_1: null, vote_average: 6 },
        ...Array.from({ length: 10 }, (_, index) => ({
          file_path: '/extra' + index + '.jpg',
          iso_639_1: null,
          vote_average: 1,
        })),
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
    // Main backdrop first, then textless by rating, titled stills last.
    expect(extras.backdrops).toHaveLength(BACKDROP_LIMIT);
    expect(extras.backdrops!.slice(0, 3)).toEqual([
      '/backdrop.jpg',
      '/high.jpg',
      '/low.jpg',
    ]);
    expect(extras.backdrops).not.toContain('/titled.jpg');
    expect(extras.cast![0]).toEqual({
      id: 100,
      name: 'Actor 0',
      character: null,
      profile_path: null,
    });
    expect(extras.detailsFetchedAt).toBeInstanceOf(Date);
    expect(extras.detailsVersion).toBe(DETAILS_VERSION);
  });

  it('lists every director and merges key crew jobs per person', () => {
    const extras = toMovieExtras(tmdb());
    expect(extras.directors).toEqual([
      { id: 9339, name: 'Lana Wachowski', profile_path: null },
      { id: 9340, name: 'Lilly Wachowski', profile_path: '/lilly.jpg' },
    ]);
    // Producers are not key crew; each person appears once.
    expect(extras.crew).toEqual([
      {
        id: 9339,
        name: 'Lana Wachowski',
        profile_path: null,
        jobs: ['Writer'],
      },
      {
        id: 9340,
        name: 'Lilly Wachowski',
        profile_path: '/lilly.jpg',
        jobs: ['Writer'],
      },
      {
        id: 1,
        name: 'Bill Pope',
        profile_path: null,
        jobs: ['Director of Photography'],
      },
      {
        id: 2,
        name: 'Don Davis',
        profile_path: null,
        jobs: ['Original Music Composer'],
      },
    ]);
    const writer = toMovieExtras(
      tmdb({
        credits: {
          crew: [
            { id: 7, name: 'Both', job: 'Writer' },
            { id: 7, name: 'Both', job: 'Screenplay' },
          ],
        },
      }),
    );
    expect(writer.crew).toEqual([
      expect.objectContaining({ id: 7, jobs: ['Screenplay', 'Writer'] }),
    ]);
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
          backdrop_path: undefined,
          credits: undefined,
          videos: undefined,
          images: undefined,
        }),
      ),
    ).toMatchObject({
      runtime: null,
      tagline: null,
      director: null,
      directors: [],
      crew: [],
      cast: [],
      backdrops: [],
      trailerKey: null,
    });
  });
});

describe('MovieDetailsProvider', () => {
  let row: Partial<Movie>;
  let repository: { createQueryBuilder: jest.Mock; update: jest.Mock };
  let outdatedRows: Partial<Movie>[];
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
      detailsVersion: 0,
      genres: [{ id: 'g1', name: 'Action', tmdbId: 28, movies: [] }],
    };
    outdatedRows = [];
    const query = {
      leftJoin: () => query,
      select: () => query,
      where: () => query,
      andWhere: () => query,
      orderBy: () => query,
      getOne: jest.fn(() => Promise.resolve(row ? { ...row } : null)),
      getMany: jest.fn(() => Promise.resolve(outdatedRows)),
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
      directors: [{ id: 9339 }, { id: 9340 }],
      genres: [{ id: 'g1', name: 'Action', tmdbId: 28 }],
    });
    expect(first.details.cast[0]).toMatchObject({ id: 100 });
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
    expect(failed.details).toMatchObject({
      title: 'The Matrix',
      cast: [],
      backdrops: [],
    });
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

  // A row filled before the gallery existed: details stored, no backdrops.
  const filledBeforeGallery = (fetchedAt = new Date()) => ({
    runtime: 136,
    backdrop_path: '/backdrop.jpg',
    backdrops: null,
    detailsFetchedAt: fetchedAt,
    detailsVersion: 0,
  });

  it('refreshes details stored by older code on read', async () => {
    Object.assign(row, filledBeforeGallery());
    const { details, complete } = await provider.getDetails('movie-1');
    expect(complete).toBe(true);
    expect(details.backdrops?.[0]).toBe('/backdrop.jpg');
    expect(details.backdrops).toHaveLength(BACKDROP_LIMIT);
    expect(row.detailsVersion).toBe(DETAILS_VERSION);
    await provider.getDetails('movie-1');
    expect(catalogue.getMovieDetailsWithExtras).toHaveBeenCalledTimes(1);
  });

  it('refreshes rows stored before person IDs and serves them meanwhile', async () => {
    Object.assign(row, {
      detailsFetchedAt: new Date(),
      detailsVersion: 1,
      backdrops: ['/stored.jpg'],
      director: 'Old Name',
      cast: [{ name: 'Old', character: null, profile_path: null }],
    });
    catalogue.getMovieDetailsWithExtras.mockRejectedValueOnce(
      new ServiceUnavailableException(),
    );
    const stale = await provider.getDetails('movie-1');
    expect(stale.complete).toBe(false);
    expect(stale.details).toMatchObject({
      director: 'Old Name',
      directors: [],
      crew: [],
      cast: [{ id: null, name: 'Old' }],
    });
    const fresh = await provider.getDetails('movie-1');
    expect(fresh.details.cast[0].id).toBe(100);
    expect(fresh.details.directors).toHaveLength(2);
    expect(row.detailsVersion).toBe(DETAILS_VERSION);
  });

  it('does not call TMDb for current details', async () => {
    Object.assign(row, {
      detailsFetchedAt: new Date(Date.now() - 30 * 86_400_000),
      detailsVersion: DETAILS_VERSION,
      backdrops: ['/stored.jpg'],
    });
    const { details } = await provider.getDetails('movie-1');
    expect(details.backdrops).toEqual(['/stored.jpg']);
    expect(catalogue.getMovieDetailsWithExtras).not.toHaveBeenCalled();
  });

  it('asks again about a film without backdrops only after the retry window', async () => {
    catalogue.getMovieDetailsWithExtras.mockResolvedValue(
      tmdb({ backdrop_path: undefined, images: { backdrops: [] } }),
    );
    expect((await provider.getDetails('movie-1')).details.backdrops).toEqual(
      [],
    );
    await provider.getDetails('movie-1');
    expect(catalogue.getMovieDetailsWithExtras).toHaveBeenCalledTimes(1);
    const fetchedAt = row.detailsFetchedAt!.getTime();
    expect(
      isOutdated(row as Movie, fetchedAt + EMPTY_GALLERY_RETRY_MS - 1),
    ).toBe(false);
    expect(isOutdated(row as Movie, fetchedAt + EMPTY_GALLERY_RETRY_MS)).toBe(
      true,
    );
    // A film that has a gallery is never asked again.
    expect(
      isOutdated(
        { ...(row as Movie), backdrops: ['/a.jpg'] },
        fetchedAt + 10 * EMPTY_GALLERY_RETRY_MS,
      ),
    ).toBe(false);
  });

  it('serves stored details uncached when a refresh fails', async () => {
    Object.assign(row, filledBeforeGallery());
    catalogue.getMovieDetailsWithExtras.mockRejectedValueOnce(
      new ServiceUnavailableException(),
    );
    const failed = await provider.getDetails('movie-1');
    expect(failed.complete).toBe(false);
    expect(failed.details).toMatchObject({ runtime: 136, backdrops: [] });
    expect(row.detailsVersion).toBe(0);
  });

  it('backfills outdated movies one at a time and reports each outcome', async () => {
    outdatedRows = [
      { id: 'a', dbId: 1, title: 'Gallery' },
      { id: 'b', dbId: 2, title: 'No images' },
      { id: 'c', dbId: 3, title: 'Gone' },
      { id: 'd', dbId: 4, title: 'Flaky' },
    ];
    catalogue.getMovieDetailsWithExtras
      .mockResolvedValueOnce(tmdb())
      .mockResolvedValueOnce(
        tmdb({ backdrop_path: undefined, images: undefined }),
      )
      .mockRejectedValueOnce(new NotFoundException())
      .mockRejectedValueOnce(new ServiceUnavailableException());
    const summary = await provider.refreshOutdated(0);
    expect(summary).toEqual({
      outdated: 4,
      refreshed: 1,
      empty: [{ id: 'b', dbId: 2, title: 'No images' }],
      missing: [{ id: 'c', dbId: 3, title: 'Gone' }],
      failed: [{ id: 'd', dbId: 4, title: 'Flaky' }],
    });
    expect(catalogue.getMovieDetailsWithExtras.mock.calls).toEqual([
      [1],
      [2],
      [3],
      [4],
    ]);
  });
});
