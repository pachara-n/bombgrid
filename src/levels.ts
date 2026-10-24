import type { Grid, LevelFn } from "./types.ts";

/**
 * Builds the level function for a grid. Levels are quartiles of the non-zero days,
 * so a quiet profile and a busy profile both end up using all four shades.
 */
export function levelsFor(weeks: Grid): LevelFn {
  const nonZero = weeks
    .flat()
    .filter((n): n is number => n !== null && n > 0)
    .sort((a, b) => a - b);
  // value at percentile p; falls back to 1 when there is no data at all
  const q = (p: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * p))] ?? 1;
  const t1 = q(0.25),
    t2 = q(0.5),
    t3 = q(0.75);
  return (n) => (!n ? 0 : n <= t1 ? 1 : n <= t2 ? 2 : n <= t3 ? 3 : 4);
}
