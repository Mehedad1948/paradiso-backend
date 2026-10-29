import { FeaturedConfig, ScoreWeights } from './featured-config';

// Everything here is pure: the random source is passed in, so draws and
// simulations are reproducible with a seeded generator.
export type Random = () => number;

// Deterministic generator for tests and simulations (mulberry32).
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PersonSignals {
  popularity: number;
  // Sum of vote_count over the person's films.
  totalVotes: number;
  creditCount: number;
  // Credits that are films in our library.
  libraryCount: number;
}

// Where each signal stops adding score. Logarithmic, so the jump from 0 to 5
// credits counts for more than the one from 45 to 50.
const POPULARITY_CAP = 50;
const VOTES_CAP = 500_000;
const CREDITS_CAP = 50;
// "At least 3 films in our library" is the target, so 3 earns the full share.
const LIBRARY_TARGET = 3;

const saturating = (value: number, cap: number) =>
  Math.min(1, Math.log1p(Math.max(0, value)) / Math.log1p(cap));

// 0 to 1: the weighted mean of the normalised signals.
export function baseScore(signals: PersonSignals, weights: ScoreWeights) {
  const total =
    weights.popularity + weights.votes + weights.credits + weights.library;
  if (total <= 0) return 0;
  return (
    (weights.popularity * saturating(signals.popularity, POPULARITY_CAP) +
      weights.votes * saturating(signals.totalVotes, VOTES_CAP) +
      weights.credits * saturating(signals.creditCount, CREDITS_CAP) +
      weights.library *
        Math.min(1, Math.max(0, signals.libraryCount) / LIBRARY_TARGET)) /
    total
  );
}

// 1 for someone never featured; otherwise ramps linearly from 0 on the day
// they appeared to 1 once cooldownDays have passed.
export function cooldownFactor(
  daysSinceLastFeatured: number | null,
  cooldownDays: number,
) {
  if (daysSinceLastFeatured === null) return 1;
  return Math.max(0, Math.min(1, daysSinceLastFeatured / cooldownDays));
}

export type IneligibleReason =
  | 'blocked'
  | 'no_profile_path'
  | 'empty_biography'
  | 'too_few_credits'
  | 'featured_within_hard_gap';

export interface Candidate {
  tmdbPersonId: number;
  name: string;
  profilePath: string | null;
  knownForDepartment: string | null;
  biography: string;
  signals: PersonSignals;
  boost: number;
  blocked: boolean;
  // Days to the nearest appearance, past or scheduled; null if never.
  gapDays: number | null;
}

// Empty when the person may be auto-picked.
export function ineligibleReasons(
  candidate: Candidate,
  config: Pick<FeaturedConfig, 'hardMinGapDays' | 'minCredits'>,
): IneligibleReason[] {
  const reasons: IneligibleReason[] = [];
  if (candidate.blocked) reasons.push('blocked');
  if (!candidate.profilePath) reasons.push('no_profile_path');
  if (!candidate.biography.trim()) reasons.push('empty_biography');
  // A boost above 1 is an editor vouching for the person.
  if (candidate.signals.creditCount < config.minCredits && candidate.boost <= 1)
    reasons.push('too_few_credits');
  if (candidate.gapDays !== null && candidate.gapDays < config.hardMinGapDays)
    reasons.push('featured_within_hard_gap');
  return reasons;
}

export interface Weighted {
  candidate: Candidate;
  baseScore: number;
  editorialBoost: number;
  cooldownFactor: number;
  weight: number;
}

export function weigh(
  candidate: Candidate,
  config: Pick<FeaturedConfig, 'scoreWeights' | 'cooldownDays'>,
): Weighted {
  const score = baseScore(candidate.signals, config.scoreWeights);
  const cooldown = cooldownFactor(candidate.gapDays, config.cooldownDays);
  return {
    candidate,
    baseScore: score,
    editorialBoost: candidate.boost,
    cooldownFactor: cooldown,
    weight: score * candidate.boost * cooldown,
  };
}

// Eligible candidates with their weights, heaviest first.
export function weighEligible(
  candidates: Candidate[],
  config: Pick<
    FeaturedConfig,
    'scoreWeights' | 'cooldownDays' | 'hardMinGapDays' | 'minCredits'
  >,
): Weighted[] {
  return candidates
    .filter((candidate) => ineligibleReasons(candidate, config).length === 0)
    .map((candidate) => weigh(candidate, config))
    .sort((a, b) => b.weight - a.weight);
}

// One draw with chance proportional to weight. Zero weights are never drawn.
export function weightedPick<T extends { weight: number }>(
  items: T[],
  random: Random,
): T | null {
  const drawable = items.filter((item) => item.weight > 0);
  const total = drawable.reduce((sum, item) => sum + item.weight, 0);
  if (!drawable.length) return null;
  let target = random() * total;
  for (const item of drawable) {
    target -= item.weight;
    if (target < 0) return item;
  }
  // Rounding left a sliver of the last weight.
  return drawable[drawable.length - 1];
}

// Draws `count` distinct items, each draw proportional to weight.
export function weightedSample<T extends { weight: number }>(
  items: T[],
  count: number,
  random: Random,
): T[] {
  const left = [...items];
  const picked: T[] = [];
  while (picked.length < count && left.length) {
    const item = weightedPick(left, random) ?? left[0];
    picked.push(item);
    left.splice(left.indexOf(item), 1);
  }
  return picked;
}
