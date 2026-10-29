export interface ScoreWeights {
  // TMDb's popularity score for the person.
  popularity: number;
  // Votes across all their films: how many people know their work.
  votes: number;
  // How many films they are credited on.
  credits: number;
  // Films of theirs in our library; the share that makes us favour people
  // our members can actually watch.
  library: number;
}

export interface FeaturedConfig {
  // Days over which the cooldown factor ramps from 0 back up to 1.
  cooldownDays: number;
  // Absolute minimum days between two appearances.
  hardMinGapDays: number;
  // Credits needed to be eligible, unless boosted above 1.
  minCredits: number;
  scoreWeights: ScoreWeights;
  // People whose full TMDb profile is loaded per selection. Bounds the TMDb
  // requests of one draw however large the pool is.
  shortlistSize: number;
  // Pages (20 people each) of TMDb's popular people in the pool.
  popularPages: number;
  // Parallel TMDb profile requests.
  fetchConcurrency: number;
}

export const FEATURED_CONFIG = Symbol('FEATURED_CONFIG');

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  popularity: 0.25,
  votes: 0.2,
  credits: 0.1,
  library: 0.45,
};

// The homepage shows today plus this many previous days, so nobody may come
// back inside that window.
export const HISTORY_STRIP_DAYS = 10;

type Env = Record<string, string | undefined>;

function whole(env: Env, key: string, fallback: number, min: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min)
    throw new Error(`${key} must be an integer of at least ${min}`);
  return value;
}

function weights(raw: string | undefined): ScoreWeights {
  if (raw === undefined || raw.trim() === '') return DEFAULT_SCORE_WEIGHTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('SCORE_WEIGHTS must be JSON');
  }
  const result = { ...DEFAULT_SCORE_WEIGHTS };
  for (const key of Object.keys(result) as (keyof ScoreWeights)[]) {
    const value = (parsed as Record<string, unknown> | null)?.[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new Error(`SCORE_WEIGHTS.${key} must be a number of at least 0`);
    result[key] = value;
  }
  if (Object.values(result).every((value) => value === 0))
    throw new Error('SCORE_WEIGHTS needs at least one weight above 0');
  return result;
}

// Read once at startup; an invalid value stops the app rather than quietly
// changing who gets featured.
export function parseFeaturedConfig(env: Env = process.env): FeaturedConfig {
  return {
    cooldownDays: whole(env, 'COOLDOWN_DAYS', 30, 1),
    hardMinGapDays: whole(env, 'HARD_MIN_GAP_DAYS', 14, HISTORY_STRIP_DAYS + 1),
    minCredits: whole(env, 'MIN_CREDITS', 5, 0),
    scoreWeights: weights(env.SCORE_WEIGHTS),
    shortlistSize: whole(env, 'FEATURED_SHORTLIST_SIZE', 30, 1),
    popularPages: whole(env, 'FEATURED_POPULAR_PAGES', 3, 0),
    fetchConcurrency: whole(env, 'FEATURED_FETCH_CONCURRENCY', 10, 1),
  };
}
