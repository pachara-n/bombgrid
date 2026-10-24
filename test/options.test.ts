import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOutputs } from "../src/options.ts";
import { levelsFor, levelsFromGitHub } from "../src/levels.ts";
import { grid } from "./helpers.ts";

test("parses several lines with and without a query string", () => {
  const specs = parseOutputs("dist/a.svg\n\n# comment\ndist/b.svg?palette=dark&max_seconds=30&radius=3\n");
  assert.equal(specs.length, 2);
  assert.equal(specs[0].path, "dist/a.svg");
  assert.equal(specs[0].paletteName, "light");
  assert.equal(specs[0].maxSeconds, 45);
  assert.equal(specs[1].paletteName, "dark");
  assert.equal(specs[1].maxSeconds, 30);
  assert.equal(specs[1].radius, 3);
});

test("custom colours override the five levels", () => {
  const [s] = parseOutputs("x.svg?colors=111111,222222,333333,444444,#555555");
  assert.equal(s.palette.l0, "#111111");
  assert.equal(s.palette.l4, "#555555");
});

test("rejects bad input with a helpful message", () => {
  assert.throws(() => parseOutputs(""), /empty/);
  assert.throws(() => parseOutputs("x.svg?palette=neon"), /Unknown palette/);
  assert.throws(() => parseOutputs("x.svg?colors=1,2,3"), /5 hex values/);
  assert.throws(() => parseOutputs("x.svg?max_seconds=1"), /max_seconds/);
  assert.throws(() => parseOutputs("?palette=dark"), /no file path/);
});

test("levels: zero days are level 0 and the rest split into quartiles", () => {
  // thresholds are the 25/50/75th percentile values of 1..8, which are 3, 5 and 7
  const lvl = levelsFor(grid((c, r) => (r === 0 && c < 8 ? c + 1 : 0)));
  assert.equal(lvl(0), 0);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(lvl), [1, 1, 1, 2, 2, 3, 3, 4]);
});

test("levels: a single non-zero day gives a valid level", () => {
  const lvl = levelsFor(grid((c, r) => (c === 0 && r === 0 ? 7 : 0)));
  assert.ok([1, 2, 3, 4].includes(lvl(7)));
});

test("levelsFromGitHub follows GitHub's shades instead of our own quartiles", () => {
  // GitHub shows 1-6 as level 1 and 7-12 as level 2 for this profile; our own quartile rule would not.
  const counts = [1, 2, 3, 6, 7, 9, 12, 13, 17, 19, 67];
  const gh = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4];
  const weeks = grid((c, r) => (r === 0 && c < counts.length ? counts[c] : 0));
  const ghLevels = grid((c, r) => (r === 0 && c < gh.length ? gh[c] : 0));
  const lvl = levelsFromGitHub(weeks, ghLevels);
  assert.deepEqual(counts.map(lvl), gh);
  assert.notDeepEqual(counts.map(levelsFor(weeks)), gh, "sanity: our own rule differs here");
  assert.equal(lvl(0), 0);
  // a count GitHub never showed us takes the level of the closest smaller count
  assert.equal(lvl(10), 2);
  assert.equal(lvl(500), 4);
});

test("levelsFromGitHub falls back to our own rule without GitHub levels", () => {
  const weeks = grid((c, r) => (r === 0 && c < 8 ? c + 1 : 0));
  assert.deepEqual([1, 4, 8].map(levelsFromGitHub(weeks)), [1, 2, 4]);
  assert.deepEqual(
    [1, 4, 8].map(
      levelsFromGitHub(
        weeks,
        grid(() => null),
      ),
    ),
    [1, 2, 4],
  );
});
