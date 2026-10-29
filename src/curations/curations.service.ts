import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContentBlocksService } from '../movies/providers/content-blocks.service';
import { EDITORS_PICKS, LANDING_GRID } from './curations.constants';
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

const pick = (item: StoredItem) => ({ movie: toCuratedMovie(item.movie) });

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

// The two hand-curated lists on the landing page. Admins replace a list as a
// whole; everyone reads it. The frontend caches and picks the day's subset.
@Injectable()
export class CurationsService {
  private readonly logger = new Logger(CurationsService.name);

  constructor(
    private readonly store: CurationsStore,
    private readonly contentBlocks: ContentBlocksService,
  ) {}

  // ---- Public ----

  // Cells whose movie is blocked or shows nothing (no image and no poster)
  // are left out, like empty ones.
  async landingGrid() {
    const curation = await this.store.read(LANDING_GRID);
    const items = await this.visible(
      curation,
      (item) => !!(item.imageUrl || item.movie.poster_path),
    );
    return { data: items.map(gridItem), updatedAt: curation.updatedAt };
  }

  // The whole pool, in admin order; the shelf needs a poster.
  async editorsPicks() {
    const curation = await this.store.read(EDITORS_PICKS);
    const items = await this.visible(
      curation,
      (item) => !!item.movie.poster_path,
    );
    return { data: items.map(pick), updatedAt: curation.updatedAt };
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
    this.logger.log(
      `Landing grid replaced by user ${adminId}: ${dto.items.length} cells`,
    );
    return this.adminLandingGrid();
  }

  async replaceEditorsPicks(dto: ReplaceEditorsPicksRequest, adminId: number) {
    const again = repeated(dto.movieIds);
    if (again.length)
      throw new BadRequestException(
        `Each movie can be an editors' pick once; repeated: ${again.join(', ')}`,
      );
    await this.store.transaction(async (tx) => {
      await tx.lock(EDITORS_PICKS);
      const movies = await this.requireMovies(tx, dto.movieIds);
      const posterless = dto.movieIds
        .map((id) => movies.get(id)!)
        .filter((movie) => !movie.poster_path);
      if (posterless.length)
        throw new UnprocessableEntityException(
          `The shelf needs a poster; these movies have none: ${posterless
            .map((movie) => `${movie.title} (${movie.id})`)
            .join(', ')}`,
        );
      await tx.replaceItems(
        EDITORS_PICKS,
        dto.movieIds.map((movieId, slot) => ({
          slot,
          movieId,
          imageUrl: null,
          objectPosition: null,
        })),
      );
      await tx.touch(EDITORS_PICKS, adminId);
    });
    this.logger.log(
      `Editors' picks replaced by user ${adminId}: ${dto.movieIds.length} movies`,
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
