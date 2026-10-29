import {
  adultContentReason,
  adultPersonReason,
  ContentSignals,
  isArchiveFootage,
  OBSCURE_VOTE_COUNT,
} from './content-filter';
import { ContentBlockKind, ContentBlockSource } from './content-block.entity';

export interface AuditMovie extends ContentSignals {
  id: number;
  title: string;
  cast: { id: number; name: string; character?: string | null }[];
}

export interface AuditCredit extends ContentSignals {
  id: number;
  title: string;
}

export interface AuditPerson {
  id: number;
  name: string;
  adult?: boolean;
  biography?: string | null;
  // Cast and crew credits together.
  credits: AuditCredit[];
}

// null: TMDb does not know the ID.
export interface AuditSources {
  movie(tmdbId: number): Promise<AuditMovie | null>;
  person(tmdbId: number): Promise<AuditPerson | null>;
}

export interface AuditOptions {
  libraryTmdbIds: number[];
  // Reported by people; blocked whatever the rules say.
  manualMovies?: number[];
  manualPeople?: number[];
  // Kept by hand; never blocked, so nothing is linked through them either.
  keepMovies?: number[];
  keepPeople?: number[];
  // Top-billed cast checked for every examined film.
  castLimit?: number;
  // Rounds of following links from blocked items to their films and casts.
  rounds?: number;
  // A blocked film's cast member is blocked with it unless one of their
  // films has at least this many votes.
  mainstreamVotes?: number;
  log?: (message: string) => void;
}

export interface AuditBlock {
  kind: ContentBlockKind;
  tmdbId: number;
  label: string;
  source: ContentBlockSource;
  reason: string;
}

// Finds what to block: films and people that break a rule, then what they
// are linked to. A blocked person blocks their obscure films (popular ones
// stay); a blocked film blocks its cast members who have no popular film.
export async function auditContent(
  sources: AuditSources,
  {
    libraryTmdbIds,
    manualMovies = [],
    manualPeople = [],
    keepMovies = [],
    keepPeople = [],
    castLimit = 15,
    rounds = 3,
    mainstreamVotes = 500,
    log = () => undefined,
  }: AuditOptions,
): Promise<AuditBlock[]> {
  const blocks = new Map<string, AuditBlock>();
  const key = (kind: ContentBlockKind, id: number) => kind + ':' + id;
  const kept = new Set([
    ...keepMovies.map((id) => key('movie', id)),
    ...keepPeople.map((id) => key('person', id)),
  ]);
  const block = (entry: AuditBlock) => {
    const id = key(entry.kind, entry.tmdbId);
    if (blocks.has(id) || kept.has(id)) return false;
    blocks.set(id, entry);
    return true;
  };
  const movies = new Map<number, AuditMovie | null>();
  const people = new Map<number, AuditPerson | null>();
  const movie = async (id: number) => {
    if (!movies.has(id)) movies.set(id, await sources.movie(id));
    return movies.get(id)!;
  };
  const person = async (id: number) => {
    if (!people.has(id)) people.set(id, await sources.person(id));
    return people.get(id)!;
  };
  const isPopular = (found: AuditPerson) =>
    found.credits.some((credit) => (credit.vote_count ?? 0) >= mainstreamVotes);

  let movieQueue = [...new Set([...libraryTmdbIds, ...manualMovies])];
  let personQueue = [...new Set(manualPeople)];
  const examinedMovies = new Set<number>();
  const examinedPeople = new Set<number>();

  for (const id of manualMovies) {
    const found = await movie(id);
    block({
      kind: 'movie',
      tmdbId: id,
      label: found?.title ?? String(id),
      source: 'manual',
      reason: 'reported',
    });
  }
  for (const id of manualPeople) {
    const found = await person(id);
    block({
      kind: 'person',
      tmdbId: id,
      label: found?.name ?? String(id),
      source: 'manual',
      reason: 'reported',
    });
  }

  for (let round = 1; round <= rounds; round++) {
    const nextMovies: number[] = [];
    const nextPeople: number[] = [];
    log(
      `Round ${round}: ${movieQueue.length} films, ${personQueue.length} people`,
    );
    for (const id of movieQueue) {
      if (examinedMovies.has(id)) continue;
      examinedMovies.add(id);
      const found = await movie(id);
      if (!found) continue;
      const reason = adultContentReason(found);
      if (reason)
        block({
          kind: 'movie',
          tmdbId: id,
          label: found.title,
          source: 'rule',
          reason,
        });
      const blocked = blocks.has(key('movie', id));
      const cast = found.cast.filter(
        (member) => !isArchiveFootage(member.character),
      );
      // A blocked film's whole cast is checked; others only the top-billed.
      for (const member of blocked ? cast : cast.slice(0, castLimit)) {
        const performer = await person(member.id);
        if (!performer) continue;
        if (blocked && !isPopular(performer))
          block({
            kind: 'person',
            tmdbId: member.id,
            label: member.name,
            source: 'linked',
            reason: `in "${found.title}"`,
          });
        nextPeople.push(member.id);
      }
    }
    for (const id of [...personQueue, ...nextPeople]) {
      if (examinedPeople.has(id)) continue;
      const found = await person(id);
      if (!found) continue;
      const reason = adultPersonReason(found);
      if (reason)
        block({
          kind: 'person',
          tmdbId: id,
          label: found.name,
          source: 'rule',
          reason,
        });
      if (!blocks.has(key('person', id))) continue;
      examinedPeople.add(id);
      for (const credit of found.credits) {
        const creditReason = adultContentReason(credit);
        if (creditReason)
          block({
            kind: 'movie',
            tmdbId: credit.id,
            label: credit.title,
            source: 'rule',
            reason: creditReason,
          });
        else if ((credit.vote_count ?? 0) < OBSCURE_VOTE_COUNT)
          block({
            kind: 'movie',
            tmdbId: credit.id,
            label: credit.title,
            source: 'linked',
            reason: `credits "${found.name}"`,
          });
        if (blocks.has(key('movie', credit.id))) nextMovies.push(credit.id);
      }
    }
    movieQueue = nextMovies.filter((id) => !examinedMovies.has(id));
    personQueue = [];
    if (!movieQueue.length) break;
  }
  return [...blocks.values()];
}
