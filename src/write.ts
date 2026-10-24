import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Generated } from "./generate.ts";

/** Writes every generated SVG, creating folders as needed. Returns the written paths. */
export function writeOutputs(items: Generated[]): string[] {
  return items.map(({ spec, svg }) => {
    mkdirSync(dirname(spec.path), { recursive: true });
    writeFileSync(spec.path, svg);
    return spec.path;
  });
}
