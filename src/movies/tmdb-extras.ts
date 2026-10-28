import { Movie } from './movie.entity';
import { TmdbMovieWithExtras } from './providers/MovieDb.serviec';

export const CAST_LIMIT = 8;

export type MovieExtras = Pick<
  Movie,
  | 'runtime'
  | 'tagline'
  | 'backdrop_path'
  | 'director'
  | 'cast'
  | 'trailerKey'
  | 'detailsFetchedAt'
>;

// Keeps only what the details screen shows, so a row stays around 1 KB.
export function toMovieExtras(details: TmdbMovieWithExtras): MovieExtras {
  const directors = (details.credits?.crew ?? [])
    .filter((member) => member.job === 'Director')
    .map((member) => member.name);
  const trailers = (details.videos?.results ?? []).filter(
    (video) => video.site === 'YouTube' && video.type === 'Trailer',
  );
  const trailer = trailers.find((video) => video.official) ?? trailers[0];
  return {
    runtime: details.runtime || null,
    tagline: details.tagline || null,
    backdrop_path: details.backdrop_path || null,
    director: [...new Set(directors)].join(', ') || null,
    cast: (details.credits?.cast ?? []).slice(0, CAST_LIMIT).map((member) => ({
      name: member.name,
      character: member.character || null,
      profile_path: member.profile_path || null,
    })),
    trailerKey: trailer?.key.slice(0, 32) ?? null,
    detailsFetchedAt: new Date(),
  };
}
