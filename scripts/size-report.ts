// Prints raw and gzip size of the SVG for the fixture and for a dense random grid.
// Usage: npx tsx scripts/size-report.ts
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { normalizeGrid } from "../src/fetch/index.ts";
import { levelsFor } from "../src/levels.ts";
import { fitDuration, planBomber } from "../src/planner.ts";
import { renderSvg } from "../src/render.ts";
import { COLS, ROWS } from "../src/types.ts";

let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dense = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => (rnd() < 0.99 ? 1 + Math.floor(rnd() * rnd() * 30) : 0)));
const real = normalizeGrid(JSON.parse(readFileSync("fixtures/pachara-n-grid.json", "utf8")));

for (const [name, g] of [["real fixture", real], ["dense random (~369 blocks)", dense]] as const) {
  const lvl = levelsFor(g);
  const svg = renderSvg(g, lvl, fitDuration(planBomber(g, lvl), 45), "light");
  console.log(`${name}: ${(svg.length / 1024).toFixed(0)} KB raw, ${(gzipSync(svg).length / 1024).toFixed(0)} KB gzip`);
}
