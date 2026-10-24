// Parses the `outputs` input: one output per line, `path[?query]`, e.g.
//   dist/bombgrid.svg
//   dist/bombgrid-dark.svg?palette=dark&max_seconds=40
import { PALETTES } from "./render.ts";
import type { Palette } from "./render.ts";

export interface OutputSpec {
  path: string;
  /** built-in palette name, or a custom palette when `colors` was given */
  palette: Palette;
  paletteName: string;
  /** the loop is sped up so it never lasts longer than this */
  maxSeconds: number;
  /** blast radius in cells */
  radius: number;
  /** display size multiplier (1 = 750 px wide, about 1.17 matches the width of a 16 px cell graph) */
  scale: number;
}

const HEX = /^[0-9a-fA-F]{6}$/;

export const DEFAULT_MAX_SECONDS = 45;
export const DEFAULT_RADIUS = 2;
export const DEFAULT_SCALE = 1;

export function parseOutputs(input: string): OutputSpec[] {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (!lines.length) throw new Error("`outputs` is empty: give at least one file path, e.g. dist/bombgrid.svg");
  return lines.map(parseLine);
}

function parseLine(line: string): OutputSpec {
  const qi = line.indexOf("?");
  const path = (qi < 0 ? line : line.slice(0, qi)).trim();
  if (!path) throw new Error(`Output line has no file path: "${line}"`);
  const q = new URLSearchParams(qi < 0 ? "" : line.slice(qi + 1));

  const paletteName = q.get("palette") ?? "light";
  if (!(paletteName in PALETTES)) {
    throw new Error(`Unknown palette "${paletteName}" for ${path}. Use one of: ${Object.keys(PALETTES).join(", ")}`);
  }
  let palette: Palette = PALETTES[paletteName as keyof typeof PALETTES];

  // optional custom colours for the five levels: colors=ebedf0,9be9a8,40c463,30a14e,216e39 (no '#')
  const colors = q.get("colors");
  if (colors) {
    const parts = colors.split(",").map((c) => c.trim().replace(/^#/, ""));
    if (parts.length !== 5 || !parts.every((c) => HEX.test(c))) {
      throw new Error(
        `"colors" for ${path} needs 5 hex values (level 0 to 4), e.g. colors=ebedf0,9be9a8,40c463,30a14e,216e39`,
      );
    }
    palette = {
      ...palette,
      l0: `#${parts[0]}`,
      l1: `#${parts[1]}`,
      l2: `#${parts[2]}`,
      l3: `#${parts[3]}`,
      l4: `#${parts[4]}`,
    };
  }

  const maxSeconds = num(q.get("max_seconds"), DEFAULT_MAX_SECONDS, "max_seconds", path, 5, 120);
  const radius = Math.round(num(q.get("radius"), DEFAULT_RADIUS, "radius", path, 1, 6));
  const scale = num(q.get("scale"), DEFAULT_SCALE, "scale", path, 0.5, 4);
  return { path, palette, paletteName, maxSeconds, radius, scale };
}

function num(raw: string | null, def: number, name: string, path: string, min: number, max: number): number {
  if (raw === null) return def;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min || v > max)
    throw new Error(`"${name}" for ${path} must be a number between ${min} and ${max}`);
  return v;
}
