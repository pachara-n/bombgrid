// The one function both the CLI and the GitHub Action call: grid in, SVG strings out.
import { levelsFor } from "./levels.ts";
import { fitDuration, planBomber } from "./planner.ts";
import { renderSvg } from "./render.ts";
import type { OutputSpec } from "./options.ts";
import type { Grid, Plan } from "./types.ts";

export interface Generated {
  spec: OutputSpec;
  svg: string;
  plan: Plan;
}

/** Plans and renders one SVG per output spec (plans differ when radius or max_seconds differ). */
export function generateAll(weeks: Grid, specs: OutputSpec[]): Generated[] {
  const lvl = levelsFor(weeks);
  return specs.map((spec) => {
    const plan = fitDuration(planBomber(weeks, lvl, { R: spec.radius }), spec.maxSeconds);
    return { spec, plan, svg: renderSvg(weeks, lvl, plan, spec.palette) };
  });
}

export function describePlan(p: Plan): string {
  return `blocks=${p.total0} bombs=${p.bombs.length} duration=${p.T.toFixed(1)}s speedUp=${(p.speedUp ?? 1).toFixed(2)}x leftover=${p.leftover} shielded=${p.shielded}`;
}
