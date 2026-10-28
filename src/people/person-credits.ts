import { TmdbPerson } from '../movies/providers/MovieDb.serviec';

export interface CreditItem {
  tmdbId: number;
  // Our movie ID when the film is in the library; filled per request.
  movieId: string | null;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  vote_average: number | null;
  character?: string | null;
  jobs?: string[];
}

export interface PersonCredits {
  directing: CreditItem[];
  acting: CreditItem[];
  crew: CreditItem[];
}

export interface PersonProfile {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profile_path: string | null;
  knownForDepartment: string | null;
  imdbId: string | null;
  credits: PersonCredits;
}

type TmdbCredit = NonNullable<
  NonNullable<TmdbPerson['movie_credits']>['cast']
>[number];

// Talk shows and documentaries about other people credit the person as
// "Self", "Himself (archive footage)" and the like; they clutter the page.
const SELF_CREDIT = /^\s*(self|himself|herself|themselves|themself)\b/i;

// The cacheable profile: credits deduplicated per film and sorted, with
// movieId left null for the request to fill from the current library.
export function toPersonProfile(
  person: TmdbPerson,
  biography = person.biography ?? '',
): PersonProfile {
  const cast = (person.movie_credits?.cast ?? []).filter(
    (credit) => !credit.adult && !SELF_CREDIT.test(credit.character ?? ''),
  );
  const crew = (person.movie_credits?.crew ?? []).filter(
    (credit) => !credit.adult,
  );
  const acting = new Map<number, CreditItem>();
  for (const credit of cast) {
    const character = credit.character?.trim() || null;
    const entry = acting.get(credit.id);
    if (!entry) acting.set(credit.id, { ...toItem(credit), character });
    // Several roles in one film read as "Role A / Role B".
    else if (character && !entry.character?.split(' / ').includes(character))
      entry.character = entry.character
        ? entry.character + ' / ' + character
        : character;
  }
  const directing = new Map<number, CreditItem>();
  const other = new Map<number, CreditItem>();
  for (const credit of crew) {
    if (credit.job === 'Director') {
      if (!directing.has(credit.id)) directing.set(credit.id, toItem(credit));
      continue;
    }
    const job = credit.job?.trim();
    if (!job) continue;
    const entry = other.get(credit.id);
    if (!entry) other.set(credit.id, { ...toItem(credit), jobs: [job] });
    else if (!entry.jobs!.includes(job)) entry.jobs!.push(job);
  }
  return {
    id: person.id,
    name: person.name,
    biography: biography.trim(),
    birthday: person.birthday || null,
    deathday: person.deathday || null,
    placeOfBirth: person.place_of_birth || null,
    profile_path: person.profile_path || null,
    knownForDepartment: person.known_for_department || null,
    imdbId: person.external_ids?.imdb_id || null,
    credits: {
      directing: sortCredits([...directing.values()]),
      acting: sortCredits([...acting.values()]),
      crew: sortCredits([...other.values()]),
    },
  };
}

const toItem = (credit: TmdbCredit): CreditItem => ({
  tmdbId: credit.id,
  movieId: null,
  title: credit.title || credit.original_title || '',
  release_date: credit.release_date || null,
  poster_path: credit.poster_path || null,
  // TMDb reports 0 for films nobody has rated yet.
  vote_average: credit.vote_count ? (credit.vote_average ?? null) : null,
});

// Unreleased (undated) films first, then newest first, then by title.
export function sortCredits(credits: CreditItem[]): CreditItem[] {
  return credits.sort(
    (a, b) =>
      Number(!!a.release_date) - Number(!!b.release_date) ||
      (b.release_date ?? '').localeCompare(a.release_date ?? '') ||
      a.title.localeCompare(b.title),
  );
}

export const creditTmdbIds = ({ directing, acting, crew }: PersonCredits) => [
  ...new Set([...directing, ...acting, ...crew].map((item) => item.tmdbId)),
];

// Copies the cached credits with library IDs filled in; the cached profile
// itself is never changed.
export function withLibraryIds(
  profile: PersonProfile,
  movieIds: Map<number, string>,
): PersonProfile {
  const fill = (items: CreditItem[]) =>
    items.map((item) => ({
      ...item,
      movieId: movieIds.get(item.tmdbId) ?? null,
    }));
  return {
    ...profile,
    credits: {
      directing: fill(profile.credits.directing),
      acting: fill(profile.credits.acting),
      crew: fill(profile.credits.crew),
    },
  };
}
