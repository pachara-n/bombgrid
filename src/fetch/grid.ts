import { COLS, ROWS } from "../types.ts";
import type { Grid } from "../types.ts";

/**
 * Forces any list of weeks into exactly 53 columns x 7 rows.
 * Keeps the most recent 53 weeks, pads missing days with null (wall), and pads missing
 * old weeks on the left with all-null columns.
 */
export function normalizeGrid(weeks: (number | null)[][]): Grid {
  const out = weeks.slice(-COLS).map((c) => {
    const col = c.slice(0, ROWS);
    while (col.length < ROWS) col.push(null);
    return col;
  });
  while (out.length < COLS) out.unshift(Array(ROWS).fill(null));
  return out;
}
