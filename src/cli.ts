// Local entry point.
//   npm run generate -- --grid fixtures/pachara-n-grid.json --out dist     (offline, from a saved grid)
//   GH_USER=name [GH_TOKEN=...] npm run generate -- --out dist             (fetch from GitHub)
// Writes <out>/bombgrid-light.svg and <out>/bombgrid-dark.svg.
import { readFileSync } from "node:fs";
import { fetchGrid, normalizeGrid } from "./fetch/index.ts";
import { describePlan, generateAll } from "./generate.ts";
import { parseOutputs } from "./options.ts";
import { writeOutputs } from "./write.ts";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};

const out = arg("--out", "dist")!;
const gridFile = arg("--grid");
const maxSeconds = arg("--max-seconds", "45")!;

let weeks, levels, source: string;
if (gridFile) {
  weeks = normalizeGrid(JSON.parse(readFileSync(gridFile, "utf8")));
  source = gridFile;
} else {
  const user = process.env.GH_USER || process.env.GITHUB_REPOSITORY_OWNER;
  if (!user) {
    console.error("Set GH_USER or pass --grid <file>");
    process.exit(1);
  }
  ({ weeks, levels, source } = await fetchGrid({ user, token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN }));
}

const specs = parseOutputs(
  `${out}/bombgrid-light.svg?palette=light&max_seconds=${maxSeconds}\n${out}/bombgrid-dark.svg?palette=dark&max_seconds=${maxSeconds}`,
);
const results = generateAll(weeks, specs, levels);
console.log(`source=${source}`);
console.log(describePlan(results[0].plan));
for (const [i, p] of writeOutputs(results).entries())
  console.log(`${p} ${(results[i].svg.length / 1024).toFixed(0)} KB`);
