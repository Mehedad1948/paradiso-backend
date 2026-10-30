import { Movie, MovieCrewMember, MovieKeyCrewMember } from './movie.entity';
import { TmdbMovieWithExtras } from './providers/MovieDb.serviec';
import { isArchiveFootage, isBlockedImage } from './content-filter';

export const CAST_LIMIT = 8;
export const BACKDROP_LIMIT = 8;
export const KEY_CREW_LIMIT = 8;
// Key crew jobs, in the order the details screen lists them.
export const KEY_CREW_JOBS = [
  'Screenplay',
  'Writer',
  'Director of Photography',
  'Original Music Composer',
];
// Bump whenever toMovieExtras stores something new, so rows written by older
// code (including a build still serving during a deploy) are refreshed.
// 1: backdrop gallery. 2: person IDs, directors and key crew.
export const DETAILS_VERSION = 2;

export type MovieExtras = Pick<
  Movie,
  | 'runtime'
  | 'tagline'
  | 'backdrop_path'
  | 'backdrops'
  | 'director'
  | 'directors'
  | 'crew'
  | 'cast'
  | 'trailerKey'
  | 'detailsFetchedAt'
  | 'detailsVersion'
>;

// Keeps only what the details screen shows, so a row stays around 1 KB.
export function toMovieExtras(details: TmdbMovieWithExtras): MovieExtras {
  const crew = details.credits?.crew ?? [];
  const directors = new Map<number, MovieCrewMember>();
  for (const member of crew)
    if (member.job === 'Director' && !directors.has(member.id))
      directors.set(member.id, toPerson(member));
  // TMDb lists a person once per job; merge them, ordered by KEY_CREW_JOBS.
  const keyCrew = new Map<number, MovieKeyCrewMember>();
  for (const job of KEY_CREW_JOBS)
    for (const member of crew) {
      if (member.job !== job) continue;
      const entry = keyCrew.get(member.id);
      if (!entry) keyCrew.set(member.id, { ...toPerson(member), jobs: [job] });
      else if (!entry.jobs.includes(job)) entry.jobs.push(job);
    }
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
    ...new Set(
      [details.backdrop_path, ...ranked].filter(
        (path) => path && !isBlockedImage(path),
      ),
    ),
  ].slice(0, BACKDROP_LIMIT);
  return {
    runtime: details.runtime || null,
    tagline: details.tagline || null,
    backdrop_path: isBlockedImage(details.backdrop_path)
      ? (backdrops[0] ?? null)
      : details.backdrop_path || null,
    backdrops,
    director:
      [...new Set([...directors.values()].map(({ name }) => name))].join(
        ', ',
      ) || null,
    directors: [...directors.values()],
    crew: [...keyCrew.values()].slice(0, KEY_CREW_LIMIT),
    cast: (details.credits?.cast ?? [])
      .filter((member) => !isArchiveFootage(member.character))
      .slice(0, CAST_LIMIT)
      .map((member) => ({
        id: member.id,
        name: member.name,
        character: member.character || null,
        profile_path: member.profile_path || null,
      })),
    trailerKey: trailer?.key.slice(0, 32) ?? null,
    detailsFetchedAt: new Date(),
    detailsVersion: DETAILS_VERSION,
  };
}

const toPerson = (member: {
  id: number;
  name: string;
  profile_path?: string | null;
}): MovieCrewMember => ({
  id: member.id,
  name: member.name,
  profile_path: member.profile_path || null,
});
