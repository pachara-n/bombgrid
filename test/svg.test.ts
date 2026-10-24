// Tests of the SVG itself: one SMIL clock, event times, the character's path, reduced motion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLS } from "../src/types.ts";
import type { Grid } from "../src/types.ts";
import { levelsFor } from "../src/levels.ts";
import { fitDuration, planBomber } from "../src/planner.ts";
import { renderSvg } from "../src/render.ts";
import { grid, makeRng } from "./helpers.ts";

const rnd = makeRng(777);
const randomGrid = (density: number, maxCount = 20): Grid =>
  grid((c, r) => (c === COLS - 1 && r > 4 ? null : rnd() < density ? 1 + Math.floor(rnd() * rnd() * maxCount) : 0));

const build = (g: Grid) => {
  const lvl = levelsFor(g);
  const plan = fitDuration(planBomber(g, lvl), 45);
  return { plan, svg: renderSvg(g, lvl, plan, "light"), C: +(plan.T + 3.5).toFixed(2) };
};

// All SMIL elements of the picture, as their attribute strings.
const smilElements = (svg: string) => [...svg.matchAll(/<(?:animate|animateTransform)\s([^>]*)\/>/g)].map((m) => m[1]);
const attr = (el: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(el)?.[1];
const nums = (s: string) => s.split(";").map(Number);

test("a full board stays within the size budget", () => {
  const { svg } = build(grid(() => 1 + Math.floor(rnd() * 10)));
  assert.ok(svg.length / 1024 < 450, `${(svg.length / 1024).toFixed(0)} KB is over the 450 KB budget for a full board`);
});

test("SVG carries a description and a reduced-motion fallback", () => {
  const { svg } = build(grid((c, r) => (c === 10 && r === 3 ? 1 : 0)));
  assert.match(svg, /<desc>[^<]+<\/desc>/);
  assert.match(svg, /@media \(prefers-reduced-motion:reduce\)\{\.anim\{display:none\}\.rm\{display:inline\}\}/);
  // the static layer has the blocks but not a single animation
  const staticLayer = svg.slice(svg.indexOf('<g class="rm">'));
  assert.ok(staticLayer.includes('<rect class="l1"'));
  assert.ok(!/<animate/.test(staticLayer));
});

test("everything runs on one SMIL clock: same dur and begin, no CSS animation carries timing", () => {
  const { svg, C } = build(randomGrid(0.5));
  const els = smilElements(svg);
  assert.ok(els.length > 10);
  for (const el of els) {
    assert.equal(attr(el, "dur"), `${C}s`, "every animation must have the same loop length");
    assert.equal(attr(el, "begin"), "0s");
    assert.equal(attr(el, "repeatCount"), "indefinite");
  }
  // the only CSS animations left are cosmetic loops without any event time in them
  const css = /<style>(.*?)<\/style>/s.exec(svg)![1];
  assert.deepEqual([...css.matchAll(/animation:(\w+)/g)].map((m) => m[1]).sort(), ["blink", "pulse"]);
  assert.ok(!/animation-delay/.test(css));
});

test("keyTimes are valid for every SMIL animation", () => {
  const { svg } = build(randomGrid(0.5));
  for (const el of smilElements(svg)) {
    const kt = nums(attr(el, "keyTimes")!);
    assert.equal(kt.length, attr(el, "values")!.split(";").length, "keyTimes and values must pair up");
    assert.equal(kt[0], 0, "the first keyTime must be 0");
    assert.ok(
      kt.every((v, i) => v >= 0 && v <= 1 && (i === 0 || v >= kt[i - 1])),
      "within [0,1] and not decreasing",
    );
    if (attr(el, "calcMode") === "linear") assert.equal(kt[kt.length - 1], 1, "a linear animation must end at 1");
  }
});

test("bombs and flames appear at the planned times", () => {
  const { svg, plan, C } = build(randomGrid(0.3));
  // the discrete "0;1;0" windows in document order: flames (one per bomb), then bombs, then shields
  const windows = smilElements(svg)
    .filter((el) => attr(el, "values") === "0;1;0" && attr(el, "calcMode") === "discrete")
    .map((el) => nums(attr(el, "keyTimes")!));
  const n = plan.bombs.length;
  assert.equal(windows.length, n * 2 + plan.shielded);
  plan.bombs.forEach((b, i) => {
    const flame = windows[i],
      bomb = windows[n + i];
    assert.ok(Math.abs(flame[1] - b.teActual / C) < 1e-4 && Math.abs(flame[2] - (b.teActual + 0.4) / C) < 1e-4);
    assert.ok(Math.abs(bomb[1] - b.tp / C) < 1e-4 && Math.abs(bomb[2] - b.teActual / C) < 1e-4);
  });
});

// Reads the character's animateTransform back into [time fraction, x, y] points.
function readWalk(svg: string): [number, number, number][] {
  const el = smilElements(svg).find((e) => attr(e, "type") === "translate")!;
  const kt = nums(attr(el, "keyTimes")!);
  const vals = attr(el, "values")!
    .split(";")
    .map((v) => v.split(" ").map(Number));
  return kt.map((k, i) => [k, vals[i][0], vals[i][1]]);
}

test("the character follows the plan at every planned time", () => {
  const { svg, plan, C } = build(randomGrid(0.5));
  const frames = readWalk(svg);
  assert.ok(frames.length >= 2);
  assert.equal(frames[frames.length - 1][0], 1);

  // reading the points back (linear in between) must give the planned position at every planned time
  const at = (frac: number) => {
    for (let i = 0; i < frames.length - 1; i++) {
      const [p0, x0, y0] = frames[i],
        [p1, x1, y1] = frames[i + 1];
      if (frac >= p0 && frac <= p1) {
        const k = p1 > p0 ? (frac - p0) / (p1 - p0) : 0;
        return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
      }
    }
    return [frames[frames.length - 1][1], frames[frames.length - 1][2]];
  };
  for (const [t, c, r] of plan.moves) {
    const [x, y] = at(t / C);
    // keyTimes are rounded to 0.00001 of the loop (under 1 ms), so allow a small slack
    assert.ok(
      Math.abs(x - (c * 14 + 5.5)) < 0.1 && Math.abs(y - (r * 14 + 5.5)) < 0.1,
      `move at ${t.toFixed(2)}s is off`,
    );
  }
});

test("the character stands still at the end of the loop", () => {
  const frames = readWalk(build(randomGrid(0.3)).svg);
  const [, x, y] = frames[frames.length - 1];
  const [, px, py] = frames[frames.length - 2];
  assert.deepEqual([x, y], [px, py], "the last point repeats the previous position: no drift or bounce");
});

test("blocks disappear exactly when their last hit lands", () => {
  const { svg, plan, C } = build(randomGrid(0.3));
  const goneAt = smilElements(svg)
    .filter((el) => attr(el, "values") === "1;1;0;0")
    .map((el) => nums(attr(el, "keyTimes")!)[1])
    .sort((a, b) => a - b);
  const last = new Map<number, number>();
  for (const e of plan.blockEv) last.set(e.c * 7 + e.r, Math.max(last.get(e.c * 7 + e.r) ?? 0, e.t));
  const expected = [...last.values()].map((t) => t / C).sort((a, b) => a - b);
  assert.equal(goneAt.length, expected.length);
  goneAt.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-4));
});
