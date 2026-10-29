// TMDb's adult flag misses a lot: softcore, strip-club and nudity-compilation
// titles and their performers are usually unflagged and have few or no
// keywords. These rules combine the flag with the text, keywords and studio
// TMDb does give us. Deliberately strict: some legitimate titles and people
// are blocked too.
export interface ContentSignals {
  adult?: boolean;
  title?: string;
  original_title?: string;
  overview?: string | null;
  vote_count?: number;
  keywords?: { keywords?: { name: string }[] };
  production_companies?: { name: string }[];
}

export interface PersonSignals {
  adult?: boolean;
  biography?: string | null;
  // Their films; one with MAINSTREAM_VOTE_COUNT votes relaxes the rules.
  credits?: { vote_count?: number }[];
}

// Never acceptable in a film's title, overview or keywords, however well
// known the film.
const CORE_MOVIE =
  /\b(hentai|softcore|sexploitation|erotic\w*|eroti[ck]a|mr\.?\s?skin|cam\s?girls?)\b/i;
// Strict, but mainstream films use these too (Killers of the Flower Moon's
// "lust for wealth", Three Colors: Red's "fashion model", "a wealthy
// playboy"), so they count against any film short of MAINSTREAM_VOTE_COUNT.
const EXPLICIT_MOVIE = new RegExp(
  '\\b(' +
    [
      'naughty',
      'lust(s|ful|y)?',
      'cum',
      'bikinis?',
      'playboy',
      'playmates?',
      'penthouse',
      'centerfolds?',
      'pin-?ups?',
      // "beautiful model", "bikini model" and other "<word> model" phrases.
      '(beautiful|gorgeous|sexy|hot|bikini|nude|naked|glamou?r|swimsuit|lingerie|playboy|fashion|top|male|female|busty|topless|aspiring|young|teen|cam|figure|art|fetish)\\s+models?',
    ].join('|') +
    ')\\b',
  'i',
);
// Mainstream films use these too (Hustlers, Boogie Nights, xXx, Babe), so
// they only count against titles short of OBSCURE_VOTE_COUNT.
const SUGGESTIVE_MOVIE = new RegExp(
  '\\b(' +
    [
      'porn\\w*',
      'xxx',
      'strip\\s?clubs?',
      'strippers?',
      'striptease',
      'sex\\s?shops?',
      'topless',
      'busty',
      'bust',
      'boob\\w*',
      'nude',
      'nudity',
      'naked',
      'lingerie',
      'sexy',
      'nsfw',
      'models?',
      'modell?ing',
      'babes?',
      'beaver',
      'bombshells?',
      'hardbod(y|ies)',
      'seduc\\w*',
      'temptress\\w*',
      'hot\\s+wives',
    ].join('|') +
    ')\\b',
  'i',
);
const ADULT_STUDIOS =
  /\b(mr\.?\s?skin|playboy|penthouse|vivid|brazzers|private media|digital playground|wicked pictures|hustler)\b/i;
// Deliberately high: the site favours clean data over completeness, so
// some legitimate films and people below these lines are blocked too.
export const OBSCURE_VOTE_COUNT = 300;
export const MAINSTREAM_VOTE_COUNT = 3000;

// The first rule a film breaks, for audit reports; null when it passes.
export function adultContentReason(movie: ContentSignals): string | null {
  if (movie.adult) return 'TMDb adult flag';
  const text = [movie.title, movie.original_title, movie.overview]
    .filter(Boolean)
    .join('\n');
  const keywords = (movie.keywords?.keywords ?? []).map(({ name }) => name);
  const votes = movie.vote_count ?? 0;
  const rules: [RegExp, boolean][] = [
    [CORE_MOVIE, true],
    [EXPLICIT_MOVIE, votes < MAINSTREAM_VOTE_COUNT],
  ];
  for (const [pattern, applies] of rules) {
    if (!applies) continue;
    const match = pattern.exec(text);
    if (match) return `text "${match[0]}"`;
    const keyword = keywords.find((name) => pattern.test(name));
    if (keyword) return `keyword "${keyword}"`;
  }
  const studio = (movie.production_companies ?? []).find(({ name }) =>
    ADULT_STUDIOS.test(name),
  );
  if (studio) return `studio "${studio.name}"`;
  if (votes >= OBSCURE_VOTE_COUNT) return null;
  const suggestive =
    SUGGESTIVE_MOVIE.exec(text) ??
    keywords.map((name) => SUGGESTIVE_MOVIE.exec(name)).find(Boolean);
  return suggestive ? `obscure, text "${suggestive[0]}"` : null;
}

export const isAdultContent = (movie: ContentSignals) =>
  adultContentReason(movie) !== null;

// Any of these in a biography blocks someone known only for obscure films.
const ADULT_BIOGRAPHY = new RegExp(
  '\\b(' +
    [
      'erotic\\w*',
      'eroti[ck]a',
      'porn\\w*',
      'adult\\s+(films?|movies?|videos?|actress(es)?|actors?|entertainment|entertainers?|industry|stars?|models?|performers?|content|websites?|magazines?)',
      'x-rated',
      'xxx',
      'nude',
      'nudity',
      'topless',
      'models?',
      'modell?(ing|ed)',
      'magazines?',
      'playboy',
      'playmates?',
      'penthouse',
      'centerfolds?',
      'pin-?ups?',
      'bikinis?',
      'lingerie',
      'swimsuit',
      'softcore',
      'sexploitation',
      'cam\\s?girls?',
      'onlyfans',
      'strip(per|pers|ping|tease)',
      'exotic\\s+dancer',
      'busty',
      'sexy',
    ].join('|') +
    ')\\b',
  'i',
);

// For people with a mainstream film: only adult-industry wording. Their bios
// mention modelling, magazines ("named by People magazine") and films like
// xXx or Magic Mike without saying anything about adult work.
const ADULT_INDUSTRY_BIOGRAPHY = new RegExp(
  '\\b(' +
    [
      'erotic\\w*',
      'eroti[ck]a',
      'porn\\w*',
      'adult\\s+(films?|movies?|videos?|actress(es)?|actors?|entertainment|entertainers?|industry|stars?|models?|performers?|content|websites?|magazines?)',
      'x-rated',
      'nude',
      'nudity',
      'topless',
      'playboy',
      'playmates?',
      'penthouse',
      'centerfolds?',
      'softcore',
      'sexploitation',
      'cam\\s?girls?',
      'onlyfans',
      'exotic\\s+dancer',
      '(glamou?r|bikini|lingerie|swimsuit)\\s+models?',
    ].join('|') +
    ')\\b',
  'i',
);

// Strict for people known only for obscure films, adult-industry wording
// only for anyone with a film of MAINSTREAM_VOTE_COUNT votes.
export function adultPersonReason(person: PersonSignals): string | null {
  if (person.adult) return 'TMDb adult flag';
  // "a role model for young girls" is not modelling.
  const biography = (person.biography ?? '').replace(
    /\brole[\s-]+models?\b/gi,
    '',
  );
  const mainstream = (person.credits ?? []).some(
    (credit) => (credit.vote_count ?? 0) >= MAINSTREAM_VOTE_COUNT,
  );
  const match = (mainstream ? ADULT_INDUSTRY_BIOGRAPHY : ADULT_BIOGRAPHY).exec(
    biography,
  );
  return match ? `biography "${match[0]}"` : null;
}

export const isAdultPerson = (person: PersonSignals) =>
  adultPersonReason(person) !== null;

// "Herself (archive footage)": reused clips, not a part in the film.
export const isArchiveFootage = (character?: string | null) =>
  /archive\s+footage/i.test(character ?? '');
