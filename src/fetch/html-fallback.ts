import { COLS, ROWS } from "../types.ts";
import type { RawCalendar } from "./graphql.ts";

type FetchLike = typeof fetch;

/**
 * Last-resort source: scrape the public contributions page.
 * This depends on GitHub's current markup (`contribution-day-component-{row}-{col}` ids, `data-level`
 * attributes and `tool-tip ... for=` labels) and can break at any time, so treat it as a fallback only.
 */
export function parseContributionsHtml(html: string): RawCalendar {
  // tooltip text by cell id, e.g. "3 contributions on May 4th."
  const tips: Record<string, string> = {};
  for (const m of html.matchAll(/for="(contribution-day-component-\d+-\d+)"[^>]*>\s*([^<]*)/g))
    tips[m[1]] = m[2].trim();

  const counts: (number | null)[][] = Array.from({ length: COLS }, () => Array(ROWS).fill(null));
  const levels: (number | null)[][] = Array.from({ length: COLS }, () => Array(ROWS).fill(null));
  let seen = 0;
  for (const m of html.matchAll(/<td[^>]*>/g)) {
    const s = m[0];
    const id = /id="(contribution-day-component-(\d+)-(\d+))"/.exec(s);
    if (!id || !s.includes("data-date")) continue;
    const row = +id[2],
      col = +id[3];
    const cm = /^(\d+|No) contributions?/.exec(tips[id[1]] || "");
    if (!cm || col >= COLS) continue;
    counts[col][row] = cm[1] === "No" ? 0 : +cm[1];
    // GitHub's own shade for this day (0..4); stays null if the attribute is missing
    const lv = /data-level="([0-4])"/.exec(s);
    levels[col][row] = lv ? +lv[1] : null;
    seen++;
  }
  if (!seen) throw new Error("HTML parse found no cells");
  return { counts, levels };
}

export async function fromHtml(user: string, fetchImpl: FetchLike = fetch): Promise<RawCalendar> {
  const res = await fetchImpl(`https://github.com/users/${user}/contributions`);
  if (!res.ok) throw new Error("HTML fetch failed: " + res.status);
  return parseContributionsHtml(await res.text());
}
