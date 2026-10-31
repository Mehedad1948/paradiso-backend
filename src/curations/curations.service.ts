import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { ContentBlocksService } from '../movies/providers/content-blocks.service';
import { MovieDbService } from '../movies/providers/MovieDb.serviec';
import {
  EDITORS_PICKS,
  LANDING_GRID,
  MAX_POSTER_CHOICES,
  PICK_IMAGE_SIZE,
  PICK_THUMBNAIL_SIZE,
  TMDB_IMAGE_BASE,
} from './curations.constants';
import {
  ReplaceEditorsPicksRequest,
  ReplaceLandingGridRequest,
} from './curations.dto';
import {
  CurationsStore,
  CurationsTx,
  LibraryMovie,
  StoredCuration,
  StoredItem,
} from './curations-store';

export interface CuratedMovie {
  id: string;
  dbId: number | null;
  title: string;
  poster_path: string | null;
  release_date: string | null;
}

const toCuratedMovie = (movie: LibraryMovie): CuratedMovie => ({
  id: movie.id,
  dbId: movie.dbId,
  title: movie.title,
  poster_path: movie.poster_path,
  release_date: movie.release_date,
});

const gridItem = (item: StoredItem) => ({
  slot: item.slot,
  imageUrl: item.imageUrl,
  objectPosition: item.objectPosition,
  movie: toCuratedMovie(item.movie),
});

const pick = (item: StoredItem) => ({
  movie: toCuratedMovie(item.movie),
  imageUrl: item.imageUrl,
});

// Values that occur more than once, first repeat first.
function repeated<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const again = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) again.add(value);
    seen.add(value);
  }
  return [...again];
}

// The public lists are the same for everyone and cost several queries, so
// the finished answer is kept a few minutes. Saving a list clears it at once;
// a blocked or edited movie shows up within the lifetime.
const PUBLIC_CACHE_SECONDS = 5 * 60;
export const LANDING_GRID_CACHE_KEY = 'curations:landing-grid';
export const EDITORS_PICKS_CACHE_KEY = 'curations:editors-picks';

// The two hand-curated lists on the landing page. Admins replace a list as a
// whole; everyone reads it. The frontend caches and picks the day's subset.
@Injectable()
export class CurationsService {
  private readonly logger = new Logger(CurationsService.name);

  constructor(
    private readonly store: CurationsStore,
    private readonly contentBlocks: ContentBlocksService,
    private readonly tmdb: MovieDbService,
    private readonly cache: CacheService,
  ) {}

  // ---- Public ----

  // Cells whose movie is blocked or shows nothing (no image and no poster)
  // are left out, like empty ones.
  landingGrid() {
    return this.cache.remember(
      LANDING_GRID_CACHE_KEY,
      PUBLIC_CACHE_SECONDS,
      async () => {
        const curation = await this.store.read(LANDING_GRID);
        const items = await this.visible(
          curation,
          (item) => !!(item.imageUrl || item.movie.poster_path),
        );
        return { data: items.map(gridItem), updatedAt: curation.updatedAt };
      },
    );
  }

  // The whole pool, in admin order; the shelf needs a cover (the pick's own
  // image, or the movie poster).
  editorsPicks() {
    return this.cache.remember(
      EDITORS_PICKS_CACHE_KEY,
      PUBLIC_CACHE_SECONDS,
      async () => {
        const curation = await this.store.read(EDITORS_PICKS);
        const items = await this.visible(
          curation,
          (item) => !!(item.imageUrl || item.movie.poster_path),
        );
        return { data: items.map(pick), updatedAt: curation.updatedAt };
      },
    );
  }

  // ---- Admin: everything stored, posterless movies included ----

  async adminLandingGrid() {
    const curation = await this.store.read(LANDING_GRID);
    return {
      data: curation.items.map(gridItem),
      updatedAt: curation.updatedAt,
      updatedBy: curation.updatedBy,
    };
  }

  async adminEditorsPicks() {
    const curation = await this.store.read(EDITORS_PICKS);
    return {
      data: curation.items.map(pick),
      updatedAt: curation.updatedAt,
      updatedBy: curation.updatedBy,
    };
  }

  async replaceLandingGrid(dto: ReplaceLandingGridRequest, adminId: number) {
    const slots = repeated(dto.items.map((item) => item.slot));
    if (slots.length)
      throw new BadRequestException(
        `Each slot can hold one movie; used more than once: ${slots.join(', ')}`,
      );
    await this.store.transaction(async (tx) => {
      await tx.lock(LANDING_GRID);
      await this.requireMovies(
        tx,
        dto.items.map((item) => item.movieId),
      );
      await tx.replaceItems(
        LANDING_GRID,
        dto.items.map((item) => ({
          slot: item.slot,
          movieId: item.movieId,
          imageUrl: item.imageUrl ?? null,
          objectPosition: item.objectPosition ?? null,
        })),
      );
      await tx.touch(LANDING_GRID, adminId);
    });
    await this.cache.delete(LANDING_GRID_CACHE_KEY);
    this.logger.log(
      `Landing grid replaced by user ${adminId}: ${dto.items.length} cells`,
    );
    return this.adminLandingGrid();
  }

  // The TMDb posters an admin can pick as a movie's cover, best rated first.
  async moviePosters(movieId: string) {
    const movie = await this.store.findMovie(movieId);
    if (!movie) throw new NotFoundException('Movie not found in the library');
    // A custom movie has no TMDb page, so there is nothing to choose from.
    if (movie.dbId === null) return { data: [] };
    const posters = await this.tmdb.getMoviePosters(movie.dbId);
    const ranked = [...posters]
      .sort(
        (a, b) =>
          (b.vote_average ?? 0) - (a.vote_average ?? 0) ||
          (b.vote_count ?? 0) - (a.vote_count ?? 0),
      )
      .slice(0, MAX_POSTER_CHOICES);
    return {
      data: ranked.map((poster) => ({
        imageUrl: `${TMDB_IMAGE_BASE}/${PICK_IMAGE_SIZE}${poster.file_path}`,
        thumbnailUrl: `${TMDB_IMAGE_BASE}/${PICK_THUMBNAIL_SIZE}${poster.file_path}`,
        width: poster.width,
        height: poster.height,
        language: poster.iso_639_1,
        voteAverage: poster.vote_average ?? 0,
        isDefault: poster.file_path === movie.poster_path,
      })),
    };
  }

  async replaceEditorsPicks(dto: ReplaceEditorsPicksRequest, adminId: number) {
    if (dto.items !== undefined && dto.movieIds !== undefined)
      throw new BadRequestException('Send items or movieIds, not both');
    const picks: { movieId: string; imageUrl?: string | null }[] =
      dto.items ?? (dto.movieIds ?? []).map((movieId) => ({ movieId }));
    const ids = picks.map((item) => item.movieId);
    const again = repeated(ids);
    if (again.length)
      throw new BadRequestException(
        `Each movie can be an editors' pick once; repeated: ${again.join(', ')}`,
      );
    await this.store.transaction(async (tx) => {
      await tx.lock(EDITORS_PICKS);
      const movies = await this.requireMovies(tx, ids);
      const coverless = picks.filter(
        (item) => !item.imageUrl && !movies.get(item.movieId)!.poster_path,
      );
      if (coverless.length)
        throw new UnprocessableEntityException(
          `The shelf needs a poster; these movies have none: ${coverless
            .map((item) => movies.get(item.movieId)!)
            .map((movie) => `${movie.title} (${movie.id})`)
            .join(', ')}`,
        );
      await tx.replaceItems(
        EDITORS_PICKS,
        picks.map((item, slot) => ({
          slot,
          movieId: item.movieId,
          imageUrl: item.imageUrl ?? null,
          objectPosition: null,
        })),
      );
      await tx.touch(EDITORS_PICKS, adminId);
    });
    await this.cache.delete(EDITORS_PICKS_CACHE_KEY);
    this.logger.log(
      `Editors' picks replaced by user ${adminId}: ${picks.length} movies`,
    );
    return this.adminEditorsPicks();
  }

  // ---- Helpers ----

  private async visible(
    curation: StoredCuration,
    shows: (item: StoredItem) => boolean,
  ): Promise<StoredItem[]> {
    return this.contentBlocks.without(
      'movie',
      curation.items.filter(shows),
      (item) => item.movie.dbId,
    );
  }

  // 422 naming every id that is not in the library. Keyed by id as stored.
  private async requireMovies(tx: CurationsTx, ids: string[]) {
    const found = new Map(
      (await tx.findMovies([...new Set(ids)])).map((movie) => [
        movie.id,
        movie,
      ]),
    );
    const missing = [...new Set(ids)].filter((id) => !found.has(id));
    if (missing.length)
      throw new UnprocessableEntityException(
        `Movies not found in the library: ${missing.join(', ')}`,
      );
    return found;
  }
}
