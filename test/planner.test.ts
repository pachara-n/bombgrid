// Property tests for the planner and renderer over edge cases and 150 random grids.
// Hard rules: terminates, nothing left standing, nobody placed unsafely, character never inside a blast
// (except shielded bombs), the SVG is sane and the loop never exceeds the cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLS, ROWS } from "../src/types.ts";
import type { Grid } from "../src/types.ts";
import { levelsFor } from "../src/levels.ts";
import { fitDuration, planBomber } from "../src/planner.ts";
import { renderSvg } from "../src/render.ts";
import { blastViolations, checkSvg, grid, makeRng } from "./helpers.ts";

const rnd = makeRng();
const randomGrid = (density: number, maxCount = 20, nullTail = 0): Grid =>
  grid((c, r) =>
    c === COLS - 1 && r >= ROWS - nullTail ? null : rnd() < density ? 1 + Math.floor(rnd() * rnd() * maxCount) : 0,
  );

const MAX_SECONDS = 45;

const cases: [string, Grid][] = [
  ["empty grid (0 active days)", grid(() => 0)],
  ["all cells null", grid(() => null)],
  ["one active day", grid((c, r) => (c === 20 && r === 3 ? 5 : 0))],
  ["one active day, level 4 only", grid((c, r) => (c === 20 && r === 3 ? 99 : 0))],
  ["full grid, every day active (371)", grid(() => 1 + Math.floor(rnd() * 10))],
  ["full grid with trailing nulls", randomGrid(1, 10, 5)],
  ["only last column", grid((c) => (c === COLS - 1 ? 3 : 0))],
  ["only one row (Sunday)", grid((c, r) => (r === 0 ? 4 : 0))],
  ["only one column", grid((c) => (c === 10 ? 4 : 0))],
  ["checkerboard", grid((c, r) => ((c + r) % 2 ? 3 : 0))],
  ["every other column active", grid((c) => (c % 2 ? 3 : 0))],
  ["all bombs level 4 (equal counts but sparse)", grid(() => (rnd() < 0.3 ? 50 : 0))],
  // regression targets: the three bugs found while building the prototype
  [
    "regression: lone block (escape must walk out through the new bomb's own cross)",
    grid((c, r) => (c === 10 && r === 3 ? 1 : 0)),
  ],
  [
    "regression: dense board with a tiny floor pocket (no bomb without a safe escape)",
    grid((c, r) => (c < 3 && r < 3 ? 0 : 5)),
  ],
  [
    "regression: start inside a trapped pocket",
    grid((c, r) => (c === 0 && r === 0 ? 0 : c <= 1 && r <= 1 ? 4 : c < 5 ? 2 : 0)),
  ],
];
for (let i = 0; i < 150; i++)
  cases.push([`random #${i} density ${(i / 150).toFixed(2)}`, randomGrid(i / 150, 30, i % 4)]);

for (const [name, g] of cases) {
  test(name, () => {
    const lvl = levelsFor(g);
    const plan = fitDuration(planBomber(g, lvl), MAX_SECONDS);
    assert.equal(plan.leftover, 0, "no block may be left standing");
    assert.ok(plan.T <= MAX_SECONDS + 0.01, `duration ${plan.T.toFixed(1)}s is over the cap`);
    assert.equal(plan.noEscape, 0, "every placed bomb needs an escape route");
    assert.equal(blastViolations(plan), 0, "character was inside a blast");
    assert.deepEqual(checkSvg(renderSvg(g, lvl, plan, "light")), []);
    assert.deepEqual(checkSvg(renderSvg(g, lvl, plan, "dark")), []);
  });
}

test("shield fallback stays rare on random grids", () => {
  let bombs = 0,
    shielded = 0;
  for (const [, g] of cases) {
    const plan = planBomber(g, levelsFor(g));
    bombs += plan.bombs.length;
    shielded += plan.shielded;
  }
  assert.ok(shielded / bombs < 0.02, `shielded ratio ${((100 * shielded) / bombs).toFixed(2)}% is too high`);
});

test("fitDuration scales every time together", () => {
  const g = randomGrid(0.9, 30);
  const plan = planBomber(g, levelsFor(g));
  assert.ok(plan.T > 45, "this grid should be long enough to need compression");
  const fit = fitDuration(plan, 45);
  const k = 45 / plan.T;
  assert.ok(Math.abs(fit.T - 45) < 1e-9);
  assert.ok(Math.abs(fit.speedUp! - 1 / k) < 1e-9);
  fit.bombs.forEach((b, i) => {
    assert.ok(
      Math.abs(b.te - b.tp - (plan.bombs[i].te - plan.bombs[i].tp) * k) < 1e-9,
      "fuse must scale with the plan",
    );
  });
});

test("fitDuration leaves short plans alone", () => {
  const g = grid((c, r) => (c === 10 && r === 3 ? 1 : 0));
  const plan = planBomber(g, levelsFor(g));
  assert.equal(fitDuration(plan, 45).speedUp, 1);
});

test("level 4 blocks need two hits", () => {
  // seven small days (1..7) far away so that 99 really is in the top quartile (a lone day would be level 1)
  const g = grid((c, r) => (c === 10 && r === 3 ? 99 : r === 0 && c >= 40 && c < 47 ? c - 39 : 0));
  assert.equal(levelsFor(g)(99), 4);
  const plan = planBomber(g, levelsFor(g));
  const hitsOnBlock = plan.blockEv.filter((e) => e.c === 10 && e.r === 3);
  assert.equal(hitsOnBlock.length, 2);
  assert.deepEqual(
    hitsOnBlock.map((e) => e.left),
    [1, 0],
  );
});

test("busy boards use fewer debris shards so the SVG stays small", () => {
  const dense = grid(() => 1 + Math.floor(rnd() * 10));
  const lvl = levelsFor(dense);
  const svg = renderSvg(dense, lvl, fitDuration(planBomber(dense, lvl), 45), "light");
  assert.equal(svg.match(/class="s d3/g), null, "no third or fourth shard on a busy board");
  assert.ok(svg.length / 1024 < 450, `${(svg.length / 1024).toFixed(0)} KB is over the 450 KB budget for a full board`);
});

test("SVG carries a description and a reduced-motion fallback", () => {
  const g = grid((c, r) => (c === 10 && r === 3 ? 1 : 0));
  const lvl = levelsFor(g);
  const svg = renderSvg(g, lvl, planBomber(g, lvl), "light");
  assert.match(svg, /<desc>[^<]+<\/desc>/);
  assert.match(svg, /@media \(prefers-reduced-motion:reduce\)\{\*\{animation:none!important\}\.w\{display:none\}\}/);
  assert.match(svg, /class="w"/);
});
