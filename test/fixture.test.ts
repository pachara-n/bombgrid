// End-to-end checks on the real contribution grid in fixtures/, including the CLI as a smoke test.
//
// The snapshot is a SHA-256 of the generated SVG. When you change the renderer ON PURPOSE, look at the
// new SVG in a browser and then refresh the hashes with:  UPDATE_SNAPSHOT=1 npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeGrid } from "../src/fetch/index.ts";
import { generateAll } from "../src/generate.ts";
import { parseOutputs } from "../src/options.ts";
import { checkSvg } from "./helpers.ts";

const fixture = normalizeGrid(JSON.parse(readFileSync("fixtures/pachara-n-grid.json", "utf8")));
const SNAPSHOT_FILE = "test/fixture.snapshot.json";
const specs = parseOutputs("light.svg?palette=light\ndark.svg?palette=dark");
const [light, dark] = generateAll(fixture, specs);
// the same profile saved together with GitHub's own shades (what the action gets from the API)
const calendar = JSON.parse(readFileSync("fixtures/pachara-n-calendar.json", "utf8"));
const withLevels = generateAll(normalizeGrid(calendar.counts), specs, normalizeGrid(calendar.levels));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// Budget for the real profile. Bigger SVGs load slower inside a README.
const MAX_KB = 200;

test("real grid: the plan matches the numbers recorded in the README", () => {
  const p = light.plan;
  assert.equal(p.total0, 123);
  assert.equal(p.bombs.length, 70);
  assert.equal(p.leftover, 0);
  assert.equal(p.shielded, 0);
  assert.ok(Math.abs(p.T - 33.2) < 0.1, `duration ${p.T}`);
  assert.equal(p.speedUp, 1);
});

test("real grid: SVGs are well-formed and within the size budget", () => {
  for (const r of [light, dark]) {
    assert.deepEqual(checkSvg(r.svg), []);
    assert.ok(r.svg.length / 1024 < MAX_KB, `${(r.svg.length / 1024).toFixed(0)} KB is over the ${MAX_KB} KB budget`);
  }
});

test("real grid: SVG output is unchanged (snapshot)", () => {
  const actual = {
    light: sha(light.svg),
    dark: sha(dark.svg),
    calendarLight: sha(withLevels[0].svg),
    calendarDark: sha(withLevels[1].svg),
  };
  if (process.env.UPDATE_SNAPSHOT || !existsSync(SNAPSHOT_FILE)) {
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  assert.deepEqual(
    actual,
    JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8")),
    "SVG changed; review it, then run UPDATE_SNAPSHOT=1 npm test",
  );
});

test("light and dark differ only in colours, not in the animation", () => {
  const strip = (s: string) => s.replace(/#[0-9a-fA-F]{6}/g, "#").replace(/rgba?\([^)]*\)/g, "c");
  assert.equal(strip(light.svg), strip(dark.svg));
});

test("CLI smoke test: --grid writes both files", () => {
  const out = mkdtempSync(join(tmpdir(), "bombgrid-"));
  const stdout = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "--grid", "fixtures/pachara-n-grid.json", "--out", out],
    { encoding: "utf8" },
  );
  assert.match(stdout, /blocks=123 bombs=70/);
  for (const f of ["bombgrid-light.svg", "bombgrid-dark.svg"]) {
    assert.ok(readFileSync(join(out, f), "utf8").startsWith("<svg"), f);
  }
});

test("with GitHub levels every block gets the shade GitHub shows", () => {
  const counts = normalizeGrid(calendar.counts);
  const levels = normalizeGrid(calendar.levels);
  const svg = withLevels[0].svg;
  // blocks of the animated layer are <rect class="lN" .../> right after their fade animation; count them per level
  const drawn = [0, 0, 0, 0, 0];
  const animated = svg.slice(svg.indexOf('<g class="anim">'), svg.indexOf('<g class="rm">'));
  for (const m of animated.matchAll(/<g>(?:<animate[^>]*\/>)?<rect class="l([1-4])"/g)) drawn[+m[1]]++;
  const expected = [0, 0, 0, 0, 0];
  counts.forEach((col, c) =>
    col.forEach((n, r) => {
      if (n && n > 0) expected[levels[c][r]!]++;
    }),
  );
  assert.deepEqual(drawn, expected);
});
