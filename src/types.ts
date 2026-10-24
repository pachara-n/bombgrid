// Shared types and grid constants. Everything else imports from here so the 53x7 size lives in one place.

/** The contribution calendar is 53 weeks (columns) by 7 weekdays (rows). */
export const COLS = 53;
export const ROWS = 7;

/**
 * weeks[col][row]; row 0 = Sunday.
 * count > 0 = a block, 0 = empty floor, null = a day that does not exist yet (acts as a wall).
 */
export type Grid = (number | null)[][];

/** Maps a raw commit count to a level: 0 = no commits, 1..4 = quartile of the non-zero days. */
export type LevelFn = (count: number) => 0 | 1 | 2 | 3 | 4;

/** One step of the walk: [time in seconds, column, row]. */
export type Move = [t: number, c: number, r: number];

export interface Bomb {
  c: number;
  r: number;
  /** time the bomb was placed */
  tp: number;
  /** time it was planned to explode */
  te: number;
  /** time it actually exploded (can be earlier than te when another blast chains into it) */
  teActual: number;
  /** how far the flames reach: [right, left, down, up] in cells */
  arms: [number, number, number, number];
  /** cells (with blocks) this bomb was expected to hit when placed */
  pred: [number, number][];
  /** true when the character had no safe escape and uses the shield bubble */
  shielded: boolean;
  noEscape?: boolean;
  done?: boolean;
}

/** A block took a hit at time t; `left` is how many hits it still has (0 = destroyed). */
export interface BlockEvent {
  t: number;
  c: number;
  r: number;
  left: number;
}

export interface Plan {
  moves: Move[];
  bombs: Bomb[];
  blockEv: BlockEvent[];
  /** total duration of the plan in seconds (without the end hold) */
  T: number;
  leftover: number;
  /** number of blocks at the start */
  total0: number;
  R: number;
  FUSE: number;
  noEscape: number;
  shielded: number;
  /** set by fitDuration: how much faster than the natural pace the plan plays */
  speedUp?: number;
}

export type Theme = "light" | "dark";
