import { isAdultContent, isAdultPerson } from './content-filter';

describe('isAdultContent', () => {
  // Real TMDb data for titles that reached the library unflagged.
  it.each([
    [
      'strip-club drama with no votes',
      {
        id: 893854,
        adult: false,
        title: 'Body Language',
        overview:
          'Filmed on location in a particular strip club. It follows the strippers/dancers and the drama from the inside point of view.',
        vote_count: 0,
        keywords: { keywords: [] },
        production_companies: [],
      },
    ],
    [
      'nudity compilation from an adult studio',
      {
        id: 1777892,
        adult: false,
        title: 'Busty Blondes with Natural Racks',
        overview:
          "Blondes really do have more fun- and so will you when you check out the topless antics of the boobalicious blonde babes on Mr. Skin's Busty Blondes with Natural Racks playlist.",
        vote_count: 1,
        keywords: { keywords: [{ name: 'celebrity' }] },
        production_companies: [{ name: 'Mr. Skin' }],
      },
    ],
    [
      'an obscure porn title',
      { title: 'Office Porn Stories', overview: '', vote_count: 2 },
    ],
    ['the adult flag', { adult: true, title: 'Anything', vote_count: 900 }],
    [
      'an erotic keyword',
      {
        title: 'Plain title',
        vote_count: 5000,
        keywords: { keywords: [{ name: 'erotic movie' }] },
      },
    ],
    [
      'an adult studio alone',
      {
        title: 'Plain title',
        vote_count: 0,
        production_companies: [{ name: 'Playboy Entertainment' }],
      },
    ],
  ])('blocks %s', (_, movie) => expect(isAdultContent(movie)).toBe(true));

  it.each([
    [
      'a popular film set in a strip club',
      {
        title: 'Hustlers',
        overview:
          'A crew of savvy former strip club employees band together to turn the tables on their Wall Street clients.',
        vote_count: 4800,
      },
    ],
    [
      'a well-known film with "naked" in the title',
      { title: 'The Naked Gun', overview: 'A comedy.', vote_count: 2900 },
    ],
    [
      'a popular film about the porn industry',
      {
        title: 'Boogie Nights',
        overview: 'A young man rises to stardom in the 1970s porn industry.',
        vote_count: 3500,
      },
    ],
    ['xXx', { title: 'xXx', overview: 'An action film.', vote_count: 4500 }],
    [
      'an obscure ordinary drama',
      {
        title: 'Quiet Fields',
        overview: 'Two farmers fall out.',
        vote_count: 0,
      },
    ],
    [
      'words that only contain a blocked term',
      { title: 'Expornographer', overview: 'Sussex nudists', vote_count: 9000 },
    ],
  ])('allows %s', (_, movie) => expect(isAdultContent(movie)).toBe(false));
});

describe('stricter title rules', () => {
  it.each([
    ['Bikini Beach Party', 500],
    ['Naughty Neighbours', 500],
    ['Lust in the Dust', 500],
    ['Camgirl Confessions', 500],
    ['The Beautiful Model', 500],
    ['Diary of a Swimsuit Model', 500],
    ['Playboy: Girls of Las Vegas', 500],
    ['Hardbody Bombshells', 3],
    ['Hot Wives, Inc', 3],
    ['Babes II: Lost in Beaver Creek', 3],
    ['Police Bust', 3],
  ])('blocks "%s"', (title, vote_count) =>
    expect(isAdultContent({ title, vote_count })).toBe(true),
  );

  it.each([
    ['Babe', 2000],
    ['The Big Bust', 900],
    ['Lustrous Lights', 5],
    ['Wanderlust', 5],
  ])('allows "%s"', (title, vote_count) =>
    expect(isAdultContent({ title, vote_count })).toBe(false),
  );
});

describe('mainstream films', () => {
  it.each([
    [
      'Killers of the Flower Moon',
      {
        keywords: { keywords: [{ name: 'lust for wealth' }] },
        vote_count: 4000,
      },
    ],
    [
      'a film with a "fashion model" keyword at the mainstream line',
      { keywords: { keywords: [{ name: 'fashion model' }] }, vote_count: 3000 },
    ],
    [
      'The Wolf of Wall Street',
      { overview: 'A wealthy playboy stockbroker.', vote_count: 24000 },
    ],
  ])('allows %s', (title, signals) =>
    expect(isAdultContent({ title, ...signals })).toBe(false),
  );

  it('still blocks the strict words below the mainstream line', () =>
    expect(isAdultContent({ title: 'Lust for Gold', vote_count: 2999 })).toBe(
      true,
    ));

  it('blocks erotic films however popular', () =>
    expect(
      isAdultContent({
        title: 'Popular',
        keywords: { keywords: [{ name: 'erotic thriller' }] },
        vote_count: 9000,
      }),
    ).toBe(true));
});

describe('isAdultPerson', () => {
  it.each([
    'Blonde model who appeared in a number of magazine spreads.',
    'American erotic film actress and nude model.',
    'She was Playboy Playmate of the Month for June.',
    'Best known for her work in adult films.',
    'Started her career modeling bikinis.',
    'A former exotic dancer.',
  ])('blocks "%s"', (biography) =>
    expect(isAdultPerson({ biography })).toBe(true),
  );

  it.each([
    '',
    'Born in Ohio, she studied theatre and became a role model for young actors.',
    'An English actor known for adult dramas? No: for dramas about adult life.',
  ])('allows "%s"', (biography) =>
    expect(isAdultPerson({ biography })).toBe(false),
  );

  it('respects the TMDb adult flag', () =>
    expect(isAdultPerson({ adult: true, biography: '' })).toBe(true));
});

describe('people with a mainstream film', () => {
  const credits = [{ vote_count: 40000 }];
  it.each([
    'Named one of the most beautiful people by People magazine.',
    'She began her career as a fashion model.',
    'Known for xXx and Pulp Fiction.',
    'He played a stripper in Magic Mike.',
  ])('allows "%s"', (biography) =>
    expect(isAdultPerson({ biography, credits })).toBe(false),
  );

  it.each([
    'She was Playboy Playmate of the Month.',
    'Starred in the erotic romance Fifty Shades of Grey.',
    'Former adult film actress.',
    'A glamour model turned actress.',
  ])('blocks "%s"', (biography) =>
    expect(isAdultPerson({ biography, credits })).toBe(true),
  );

  it('stays strict for people without one', () =>
    expect(
      isAdultPerson({
        biography: 'Appeared in magazine spreads.',
        credits: [{ vote_count: 2999 }],
      }),
    ).toBe(true));
});

describe('vote lines', () => {
  it('treats suggestive words as adult up to 300 votes', () => {
    expect(isAdultContent({ title: 'Nude Awakening', vote_count: 299 })).toBe(
      true,
    );
    expect(isAdultContent({ title: 'Nude Awakening', vote_count: 300 })).toBe(
      false,
    );
  });
});
