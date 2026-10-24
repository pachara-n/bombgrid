import type { Grid } from "../types.ts";
import { normalizeGrid } from "./grid.ts";
import { fromGraphQL } from "./graphql.ts";
import type { RawCalendar } from "./graphql.ts";
import { fromHtml } from "./html-fallback.ts";

export { normalizeGrid };

export interface FetchResult {
  weeks: Grid;
  /** GitHub's own shade (0..4) for every day, when the source provided it */
  levels?: Grid;
  /** human readable name of the source that worked, so it can be logged */
  source: string;
}

/**
 * Gets the contribution grid. Uses the GraphQL API when a token is given and falls back to the
 * public page if that fails (or when there is no token).
 */
export async function fetchGrid(opts: {
  user: string;
  token?: string;
  fetchImpl?: typeof fetch;
  warn?: (msg: string) => void;
}): Promise<FetchResult> {
  const { user, token, fetchImpl = fetch, warn = console.warn } = opts;
  let raw: RawCalendar | undefined;
  let source = "";
  if (token) {
    try {
      raw = await fromGraphQL(user, token, fetchImpl);
      source = "GraphQL API";
    } catch (e) {
      warn("GraphQL failed, falling back to public HTML: " + (e as Error).message);
    }
  }
  if (!raw) {
    raw = await fromHtml(user, fetchImpl);
    source = "public contributions page (fallback)";
  }
  return {
    weeks: normalizeGrid(raw.counts),
    levels: raw.levels ? normalizeGrid(raw.levels) : undefined,
    source,
  };
}
