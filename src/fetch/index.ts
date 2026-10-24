import type { Grid } from "../types.ts";
import { normalizeGrid } from "./grid.ts";
import { fromGraphQL } from "./graphql.ts";
import { fromHtml } from "./html-fallback.ts";

export { normalizeGrid };

export interface FetchResult {
  weeks: Grid;
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
  let weeks: (number | null)[][] | undefined;
  let source = "";
  if (token) {
    try {
      weeks = await fromGraphQL(user, token, fetchImpl);
      source = "GraphQL API";
    } catch (e) {
      warn("GraphQL failed, falling back to public HTML: " + (e as Error).message);
    }
  }
  if (!weeks) {
    weeks = await fromHtml(user, fetchImpl);
    source = "public contributions page (fallback)";
  }
  return { weeks: normalizeGrid(weeks), source };
}
