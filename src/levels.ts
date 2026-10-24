import type { Grid, LevelFn } from "./types.ts";

/**
 * Builds the level function for a grid when GitHub did not tell us the levels (offline files).
 * Levels are quartiles of the non-zero days, so a quiet profile and a busy profile both use all four shades.
 * NOTE: this is our own rule and can differ from the shades GitHub shows; prefer levelsFromGitHub.
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

/**
 * Builds the level function from the levels GitHub itself shows on the profile, so the shades match
 * the real contribution graph. GitHub's level only depends on the count, so we remember count -> level.
 * A count we have not seen gets the level of the closest smaller count we have (or 1).
 * Falls back to levelsFor when GitHub gave no usable levels.
 */
export function levelsFromGitHub(weeks: Grid, ghLevels?: Grid): LevelFn {
  if (!ghLevels) return levelsFor(weeks);
  const byCount = new Map<number, 1 | 2 | 3 | 4>();
  weeks.forEach((col, c) =>
    col.forEach((n, r) => {
      const lv = ghLevels[c]?.[r];
      if (n === null || n <= 0 || lv === null || lv === undefined || lv < 1 || lv > 4) return;
      // if the same count ever appears with two levels, keep the higher one
      byCount.set(n, Math.max(byCount.get(n) ?? 1, lv) as 1 | 2 | 3 | 4);
    }),
  );
  if (!byCount.size) return levelsFor(weeks);
  const known = [...byCount.keys()].sort((a, b) => a - b);
  return (n) => {
    if (!n) return 0;
    const exact = byCount.get(n);
    if (exact) return exact;
    let best: number | undefined;
    for (const k of known) {
      if (k > n) break;
      best = k;
    }
    return best === undefined ? 1 : byCount.get(best)!;
  };
}
