import { CreditItem, PersonProfile } from '../people/person-credits';
import { PersonSignals } from './featured-scoring';

export interface KnownForFilm {
  tmdbId: number;
  movieId: string | null;
  title: string;
  poster_path: string;
  release_date: string | null;
}

// Each film once, whichever list it appears in.
function uniqueFilms(lists: CreditItem[][]) {
  const films = new Map<number, CreditItem>();
  for (const credit of lists.flat())
    if (!films.has(credit.tmdbId)) films.set(credit.tmdbId, credit);
  return [...films.values()];
}

export function signalsOf(
  profile: PersonProfile,
  popularity: number,
): PersonSignals {
  const { directing, acting, crew } = profile.credits;
  const films = uniqueFilms([directing, acting, crew]);
  return {
    popularity,
    totalVotes: films.reduce((sum, film) => sum + film.vote_count, 0),
    creditCount: films.length,
    libraryCount: films.filter((film) => film.movieId !== null).length,
  };
}

// Up to three films from directing and acting, best known first.
export function knownFor(profile: PersonProfile): KnownForFilm[] {
  const { directing, acting } = profile.credits;
  return uniqueFilms([directing, acting])
    .filter((film) => film.poster_path)
    .sort(
      (a, b) =>
        b.vote_count - a.vote_count ||
        (b.vote_average ?? -1) - (a.vote_average ?? -1),
    )
    .slice(0, 3)
    .map((film) => ({
      tmdbId: film.tmdbId,
      movieId: film.movieId,
      title: film.title,
      poster_path: film.poster_path!,
      release_date: film.release_date,
    }));
}

// Days from a date to each person's nearest appearance, past or scheduled.
export function gapByPerson(
  appearances: { tmdbPersonId: number; featureDate: string }[],
  daysFrom: (featureDate: string) => number,
): Map<number, number> {
  const gaps = new Map<number, number>();
  for (const { tmdbPersonId, featureDate } of appearances) {
    const gap = Math.abs(daysFrom(featureDate));
    const known = gaps.get(tmdbPersonId);
    if (known === undefined || gap < known) gaps.set(tmdbPersonId, gap);
  }
  return gaps;
}
