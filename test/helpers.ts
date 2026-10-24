// Test helpers: seeded random grids, safety checks and an SVG sanity checker.
import { COLS, ROWS } from "../src/types.ts";
import type { Grid, Plan } from "../src/types.ts";
import { XMLValidator } from "fast-xml-parser";

/** Small deterministic generator (Park-Miller) so failing cases are reproducible. */
export function makeRng(seed = 12345) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export const grid = (fn: (c: number, r: number) => number | null): Grid =>
  Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => fn(c, r)));

/** Where the character stands at time t (the last move that already happened). */
export function posAt(plan: Plan, t: number): [number, number] {
  let cur: [number, number] = [plan.moves[0][1], plan.moves[0][2]];
  for (const m of plan.moves) {
    if (m[0] <= t) cur = [m[1], m[2]];
    else break;
  }
  return cur;
}

/** Number of non-shielded bombs whose blast contained the character when they went off. */
export function blastViolations(plan: Plan): number {
  let viol = 0;
  for (const b of plan.bombs) {
    if (b.shielded) continue; // the shield power-up is allowed to stand in the blast
    const [x, y] = posAt(plan, b.teActual);
    const [right, left, down, up] = b.arms;
    if ((y === b.r && x >= b.c - left && x <= b.c + right) || (x === b.c && y >= b.r - up && y <= b.r + down)) viol++;
  }
  return viol;
}

/** Returns a list of problems found in an SVG string (empty = fine). */
export function checkSvg(svg: string): string[] {
  const errs: string[] = [];
  if (/NaN|undefined|Infinity/.test(svg)) errs.push("svg contains NaN/undefined/Infinity");
  const valid = XMLValidator.validate(svg);
  if (valid !== true) errs.push(`svg is not well-formed XML: ${valid.err.msg}`);
  // every SMIL animation needs keyTimes that pair up with its values and stay within [0,1]
  for (const m of svg.matchAll(/<animate(?:Transform)?\s([^>]*)\/>/g)) {
    const kt = /keyTimes="([^"]*)"/.exec(m[1])?.[1];
    const vals = /values="([^"]*)"/.exec(m[1])?.[1];
    if (!kt || !vals) continue;
    const a = kt.split(";").map(Number);
    if (a.some((v) => !(v >= 0 && v <= 1))) errs.push("keyTimes out of [0,1]");
    for (let i = 1; i < a.length; i++)
      if (a[i] < a[i - 1]) {
        errs.push("keyTimes decreasing");
        break;
      }
    if (a.length !== vals.split(";").length) errs.push("keyTimes/values length mismatch");
  }
  return errs;
}
