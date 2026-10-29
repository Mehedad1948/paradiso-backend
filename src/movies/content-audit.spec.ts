import { auditContent, AuditMovie, AuditPerson } from './content-audit';

const movies: Record<number, AuditMovie> = {
  // Library: a popular film starring a model, and a blocked obscure one.
  1: {
    id: 1,
    title: 'Popular Film',
    vote_count: 9000,
    cast: [
      { id: 10, name: 'Famous Former Model', character: 'Lead' },
      { id: 11, name: 'Plain Actor', character: 'Friend' },
    ],
  },
  2: {
    id: 2,
    title: 'Hardbody Bombshells',
    vote_count: 2,
    cast: [
      { id: 20, name: 'Obscure Co-star', character: 'Jill' },
      { id: 21, name: 'Popular Cameo', character: 'Himself' },
      { id: 22, name: 'Clip Only', character: 'Herself (archive footage)' },
    ],
  },
  // Reached through people.
  3: { id: 3, title: 'Late Night Tale', vote_count: 4, cast: [] },
  4: { id: 4, title: 'Big Hit', vote_count: 3000, cast: [] },
};
const credit = (id: number) => ({
  id,
  title: movies[id].title,
  vote_count: movies[id].vote_count,
});
const people: Record<number, AuditPerson> = {
  10: {
    id: 10,
    name: 'Famous Former Model',
    biography: 'A former Playboy Playmate turned actress.',
    credits: [credit(1), credit(3), credit(4)],
  },
  11: { id: 11, name: 'Plain Actor', biography: '', credits: [credit(1)] },
  20: { id: 20, name: 'Obscure Co-star', biography: '', credits: [credit(2)] },
  21: {
    id: 21,
    name: 'Popular Cameo',
    biography: 'Comedian.',
    credits: [credit(2), credit(4)],
  },
  22: { id: 22, name: 'Clip Only', biography: '', credits: [credit(2)] },
};
const sources = {
  movie: jest.fn((id: number) => Promise.resolve(movies[id] ?? null)),
  person: jest.fn((id: number) => Promise.resolve(people[id] ?? null)),
};

describe('auditContent', () => {
  it('blocks by rule, then follows links with the popularity limits', async () => {
    const blocks = await auditContent(sources, { libraryTmdbIds: [1, 2] });
    const by = Object.fromEntries(
      blocks.map((entry) => [entry.kind + ':' + entry.tmdbId, entry]),
    );
    expect(by['movie:2']).toMatchObject({ source: 'rule' });
    expect(by['person:10']).toMatchObject({
      source: 'rule',
      reason: 'biography "Playboy"',
    });
    // A blocked person takes their obscure films, not their popular ones.
    expect(by['movie:3']).toMatchObject({
      source: 'linked',
      reason: 'credits "Famous Former Model"',
    });
    expect(by['movie:1']).toBeUndefined();
    expect(by['movie:4']).toBeUndefined();
    // A blocked film takes its obscure cast, not a popular cameo, and not
    // someone only seen in archive footage.
    expect(by['person:20']).toMatchObject({ source: 'linked' });
    expect(by['person:21']).toBeUndefined();
    expect(by['person:22']).toBeUndefined();
    expect(by['person:11']).toBeUndefined();
  });

  it('blocks reported items whatever the rules say', async () => {
    const blocks = await auditContent(sources, {
      libraryTmdbIds: [],
      manualMovies: [4],
      manualPeople: [11],
    });
    expect(blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'movie', tmdbId: 4, source: 'manual' }),
        expect.objectContaining({
          kind: 'person',
          tmdbId: 11,
          source: 'manual',
        }),
      ]),
    );
  });
});
