import { Movie } from './movie.entity';
import { TmdbMovieWithExtras } from './providers/MovieDb.serviec';

export const CAST_LIMIT = 8;
export const BACKDROP_LIMIT = 8;

export type MovieExtras = Pick<
  Movie,
  | 'runtime'
  | 'tagline'
  | 'backdrop_path'
  | 'backdrops'
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
  const trailer = (details.videos?.results ?? [])
    .filter(
      (video) =>
        video.site === 'YouTube' &&
        (video.type === 'Trailer' || video.type === 'Teaser'),
    )
    // Trailer over teaser, then official, then English over untagged.
    .sort(
      (a, b) =>
        Number(b.type === 'Trailer') - Number(a.type === 'Trailer') ||
        Number(!!b.official) - Number(!!a.official) ||
        Number(b.iso_639_1 === 'en') - Number(a.iso_639_1 === 'en'),
    )[0];
  const ranked = (details.images?.backdrops ?? [])
    // Textless stills first, then the best rated and most voted.
    .sort(
      (a, b) =>
        Number(!b.iso_639_1) - Number(!a.iso_639_1) ||
        (b.vote_average ?? 0) - (a.vote_average ?? 0) ||
        (b.vote_count ?? 0) - (a.vote_count ?? 0),
    )
    .map((image) => image.file_path);
  // The main backdrop leads, so the gallery opens on the hero image.
  const backdrops = [
    ...new Set([details.backdrop_path, ...ranked].filter(Boolean)),
  ].slice(0, BACKDROP_LIMIT);
  return {
    runtime: details.runtime || null,
    tagline: details.tagline || null,
    backdrop_path: details.backdrop_path || null,
    backdrops,
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
