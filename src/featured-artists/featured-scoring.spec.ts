import { DEFAULT_SCORE_WEIGHTS, parseFeaturedConfig } from './featured-config';
import {
  baseScore,
  Candidate,
  cooldownFactor,
  ineligibleReasons,
  PersonSignals,
  seededRandom,
  weighEligible,
  weightedPick,
  weightedSample,
} from './featured-scoring';

const config = {
  cooldownDays: 30,
  hardMinGapDays: 14,
  minCredits: 5,
  scoreWeights: DEFAULT_SCORE_WEIGHTS,
};

const signals = (extra: Partial<PersonSignals> = {}): PersonSignals => ({
  popularity: 20,
  totalVotes: 50_000,
  creditCount: 20,
  libraryCount: 3,
  ...extra,
});

const candidate = (extra: Partial<Candidate> = {}): Candidate => ({
  tmdbPersonId: 1,
  name: 'Someone',
  profilePath: '/someone.jpg',
  knownForDepartment: 'Acting',
  biography: 'Known for films.',
  signals: signals(),
  boost: 1,
  blocked: false,
  gapDays: null,
  ...extra,
});

describe('seededRandom', () => {
  it('repeats for a seed and stays within [0, 1)', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(seededRandom(8)()).not.toBe(values[0]);
  });
});

describe('baseScore', () => {
  it('is 0 with no signals and never above 1', () => {
    const none = {
      popularity: 0,
      totalVotes: 0,
      creditCount: 0,
      libraryCount: 0,
    };
    expect(baseScore(none, DEFAULT_SCORE_WEIGHTS)).toBe(0);
    expect(
      baseScore(
        {
          popularity: 1e9,
          totalVotes: 1e12,
          creditCount: 1e6,
          libraryCount: 1e6,
        },
        DEFAULT_SCORE_WEIGHTS,
      ),
    ).toBeCloseTo(1, 10);
  });

  it('rises with each signal', () => {
    const base = baseScore(signals(), DEFAULT_SCORE_WEIGHTS);
    for (const more of [
      { popularity: 40 },
      { totalVotes: 200_000 },
      { creditCount: 40 },
      { libraryCount: 5 },
    ] as Partial<PersonSignals>[]) {
      // Library saturates at 3 films, so test it from below.
      const from =
        'libraryCount' in more
          ? baseScore(signals({ libraryCount: 1 }), DEFAULT_SCORE_WEIGHTS)
          : base;
      expect(baseScore(signals(more), DEFAULT_SCORE_WEIGHTS)).toBeGreaterThan(
        from,
      );
    }
  });

  it('gives films in our library a meaningful share', () => {
    const none = baseScore(signals({ libraryCount: 0 }), DEFAULT_SCORE_WEIGHTS);
    const three = baseScore(
      signals({ libraryCount: 3 }),
      DEFAULT_SCORE_WEIGHTS,
    );
    expect(three - none).toBeGreaterThanOrEqual(0.4);
    // At least 3 films is the target; more adds nothing.
    expect(
      baseScore(signals({ libraryCount: 9 }), DEFAULT_SCORE_WEIGHTS),
    ).toBeCloseTo(three, 10);
  });

  it('follows the configured weights', () => {
    const onlyLibrary = { popularity: 0, votes: 0, credits: 0, library: 1 };
    expect(
      baseScore(signals({ libraryCount: 3, popularity: 0 }), onlyLibrary),
    ).toBe(1);
    expect(baseScore(signals({ libraryCount: 0 }), onlyLibrary)).toBe(0);
    expect(
      baseScore(signals(), { popularity: 0, votes: 0, credits: 0, library: 0 }),
    ).toBe(0);
  });
});

describe('cooldownFactor', () => {
  it('ramps from 0 to 1 over the cooldown', () => {
    expect(cooldownFactor(null, 30)).toBe(1);
    expect(cooldownFactor(0, 30)).toBe(0);
    expect(cooldownFactor(15, 30)).toBe(0.5);
    expect(cooldownFactor(30, 30)).toBe(1);
    expect(cooldownFactor(400, 30)).toBe(1);
  });
});

describe('ineligibleReasons', () => {
  it('accepts a normal candidate', () => {
    expect(ineligibleReasons(candidate(), config)).toEqual([]);
  });

  it.each([
    ['blocked', { blocked: true }],
    ['no_profile_path', { profilePath: null }],
    ['empty_biography', { biography: '  ' }],
    ['too_few_credits', { signals: signals({ creditCount: 4 }) }],
    ['featured_within_hard_gap', { gapDays: 13 }],
  ] as [string, Partial<Candidate>][])('reports %s', (reason, extra) => {
    expect(ineligibleReasons(candidate(extra), config)).toEqual([reason]);
  });

  it('allows the hard gap exactly', () => {
    expect(ineligibleReasons(candidate({ gapDays: 14 }), config)).toEqual([]);
  });

  it('lets a boost bypass the credit minimum but not photo or biography', () => {
    const few = signals({ creditCount: 1 });
    expect(
      ineligibleReasons(candidate({ signals: few, boost: 2 }), config),
    ).toEqual([]);
    expect(
      ineligibleReasons(
        candidate({ signals: few, boost: 2, profilePath: null, biography: '' }),
        config,
      ),
    ).toEqual(['no_profile_path', 'empty_biography']);
  });
});

describe('weighEligible', () => {
  it('multiplies base score, boost and cooldown', () => {
    const [only] = weighEligible(
      [candidate({ boost: 4, gapDays: 15 })],
      config,
    );
    expect(only.cooldownFactor).toBe(0.5);
    expect(only.editorialBoost).toBe(4);
    expect(only.weight).toBeCloseTo(only.baseScore * 4 * 0.5, 10);
  });

  it('drops the ineligible and sorts heaviest first', () => {
    const weighed = weighEligible(
      [
        candidate({ tmdbPersonId: 1, signals: signals({ libraryCount: 0 }) }),
        candidate({ tmdbPersonId: 2, blocked: true }),
        candidate({ tmdbPersonId: 3 }),
      ],
      config,
    );
    expect(weighed.map((item) => item.candidate.tmdbPersonId)).toEqual([3, 1]);
  });
});

describe('weightedPick', () => {
  const draws = (items: { id: string; weight: number }[], count = 1000) => {
    const random = seededRandom(42);
    const tally: Record<string, number> = {};
    for (let i = 0; i < count; i++) {
      const picked = weightedPick(items, random)!;
      tally[picked.id] = (tally[picked.id] ?? 0) + 1;
    }
    return tally;
  };

  it('picks in proportion to weight (boost 5 against boost 1)', () => {
    const [a, b] = [
      candidate({ tmdbPersonId: 1, boost: 5 }),
      candidate({ tmdbPersonId: 2, boost: 1 }),
    ];
    const weighed = weighEligible([a, b], config).map((item) => ({
      id: String(item.candidate.tmdbPersonId),
      weight: item.weight,
    }));
    const tally = draws(weighed, 1000);
    // 5 : 1 means A wins 5 of every 6 draws.
    expect(tally['1'] / tally['2']).toBeGreaterThan(4);
    expect(tally['1'] / tally['2']).toBeLessThan(6.5);
  });

  it('favours the higher base score, all else equal', () => {
    const weighed = weighEligible(
      [
        candidate({ tmdbPersonId: 1, signals: signals({ libraryCount: 3 }) }),
        candidate({ tmdbPersonId: 2, signals: signals({ libraryCount: 1 }) }),
      ],
      config,
    ).map((item) => ({
      id: String(item.candidate.tmdbPersonId),
      weight: item.weight,
    }));
    const tally = draws(weighed);
    expect(tally['1']).toBeGreaterThan(tally['2']);
  });

  it('never draws a zero weight, and returns null when nothing can be drawn', () => {
    const random = seededRandom(1);
    for (let i = 0; i < 100; i++)
      expect(
        weightedPick(
          [
            { id: 'a', weight: 0 },
            { id: 'b', weight: 1 },
          ],
          random,
        )!.id,
      ).toBe('b');
    expect(weightedPick([{ weight: 0 }], random)).toBeNull();
    expect(weightedPick([], random)).toBeNull();
  });

  it('is reproducible with a seed', () => {
    const items = [1, 2, 3, 4].map((weight) => ({ weight }));
    const run = () => {
      const random = seededRandom(99);
      return Array.from(
        { length: 20 },
        () => weightedPick(items, random)!.weight,
      );
    };
    expect(run()).toEqual(run());
  });
});

describe('weightedSample', () => {
  it('draws distinct items and stops at what exists', () => {
    const items = [1, 2, 3].map((weight) => ({ weight }));
    const sample = weightedSample(items, 5, seededRandom(3));
    expect(sample).toHaveLength(3);
    expect(new Set(sample).size).toBe(3);
    expect(weightedSample(items, 2, seededRandom(3))).toHaveLength(2);
  });
});

describe('parseFeaturedConfig', () => {
  it('uses the documented defaults', () => {
    expect(parseFeaturedConfig({})).toMatchObject({
      cooldownDays: 30,
      hardMinGapDays: 14,
      minCredits: 5,
      scoreWeights: DEFAULT_SCORE_WEIGHTS,
    });
  });

  it('reads overrides, including partial score weights', () => {
    const parsed = parseFeaturedConfig({
      COOLDOWN_DAYS: '60',
      HARD_MIN_GAP_DAYS: '20',
      MIN_CREDITS: '2',
      SCORE_WEIGHTS: '{"library":1}',
    });
    expect(parsed).toMatchObject({
      cooldownDays: 60,
      hardMinGapDays: 20,
      minCredits: 2,
      scoreWeights: { ...DEFAULT_SCORE_WEIGHTS, library: 1 },
    });
  });

  it.each([
    [{ COOLDOWN_DAYS: '0' }],
    [{ COOLDOWN_DAYS: 'soon' }],
    // The page shows ten earlier days, so nobody may return inside them.
    [{ HARD_MIN_GAP_DAYS: '10' }],
    [{ SCORE_WEIGHTS: 'not json' }],
    [{ SCORE_WEIGHTS: '{"library":-1}' }],
    [{ SCORE_WEIGHTS: '{"popularity":0,"votes":0,"credits":0,"library":0}' }],
  ])('rejects %j', (env) => {
    expect(() => parseFeaturedConfig(env)).toThrow();
  });
});
