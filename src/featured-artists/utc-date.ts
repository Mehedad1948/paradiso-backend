// Feature dates are UTC calendar days as YYYY-MM-DD; server local time is
// never consulted.
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export const utcDate = (now = Date.now()) =>
  new Date(now).toISOString().slice(0, 10);

// A real calendar date, not just the right shape (2026-02-31 is not).
export function isUtcDate(value: string): boolean {
  if (!DATE_FORMAT.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

// Whole days from a to b; negative when b is earlier.
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS,
  );

export const secondsUntilNextUtcDay = (now = Date.now()) =>
  Math.max(
    1,
    Math.ceil(
      (Date.parse(addDays(utcDate(now), 1) + 'T00:00:00Z') - now) / 1000,
    ),
  );
