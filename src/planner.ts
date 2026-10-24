// Bomberman planner: decides where the character walks, where bombs go and when they explode.
// Pure function, no I/O. Time is in seconds.
import { COLS, ROWS } from "./types.ts";
import type { Bomb, BlockEvent, Grid, LevelFn, Move, Plan } from "./types.ts";

export interface PlanOptions {
  /** blast radius in cells (default 2) */
  R?: number;
  /** seconds the character needs per cell (default 0.05) */
  stepT?: number;
  /** seconds between placing a bomb and its explosion (default 0.5) */
  fuse?: number;
  /** seconds it takes to place a bomb (default 0.06) */
  placeT?: number;
}

type Cell = [number, number];

// right, left, down, up. The order matters: Bomb.arms uses the same order.
const D: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function planBomber(weeks: Grid, lvl: LevelFn, opt: PlanOptions = {}): Plan {
  const R = opt.R ?? 2,
    STEP_T = opt.stepT ?? 0.05,
    FUSE = opt.fuse ?? 0.5,
    PLACE_T = opt.placeT ?? 0.06;

  // hits[c][r]: -1 = wall, 0 = floor, otherwise how many hits the block still needs.
  // Level 4 blocks are tougher and need two hits.
  const hits = weeks.map((col) => col.map((n) => (n === null ? -1 : n > 0 ? (lvl(n) === 4 ? 2 : 1) : 0)));
  const inb = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS && hits[c][r] >= 0;
  const key = (c: number, r: number) => c * ROWS + r;

  let blocks = 0;
  hits.forEach((col) =>
    col.forEach((h) => {
      if (h > 0) blocks++;
    }),
  );
  const total0 = blocks;

  const pending: Bomb[] = []; // bombs placed but not yet exploded
  const bombsOut: Bomb[] = []; // bombs that already exploded, in order
  const blockEv: BlockEvent[] = [];
  // targeted[key] = how many pending bombs are already going to hit that block
  const targeted: Record<number, number> = {};

  // --- choose the start cell -------------------------------------------------------------------
  let start: Cell | null = null;
  {
    // Start in the largest connected floor region so the character is less likely
    // to begin inside a small trapped pocket.
    const seen = new Set<number>();
    let bestComp: Cell[] | null = null;
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        if (hits[c][r] !== 0 || seen.has(key(c, r))) continue;
        const comp: Cell[] = [[c, r]];
        const q: Cell[] = [[c, r]];
        seen.add(key(c, r));
        while (q.length) {
          const [cc, rr] = q.shift()!;
          for (const [d0, d1] of D) {
            const nc = cc + d0,
              nr = rr + d1;
            if (inb(nc, nr) && hits[nc][nr] === 0 && !seen.has(key(nc, nr))) {
              seen.add(key(nc, nr));
              comp.push([nc, nr]);
              q.push([nc, nr]);
            }
          }
        }
        if (!bestComp || comp.length > bestComp.length) bestComp = comp;
      }
    if (bestComp) start = bestComp[0];
  }
  if (!start) {
    // No empty floor at all (grid without cells, or every cell is a block).
    // Sacrifice the first block (removed at t=0) so the character has somewhere to stand.
    for (let c = 0; c < COLS && !start; c++)
      for (let r = 0; r < ROWS; r++)
        if (hits[c][r] > 0) {
          hits[c][r] = 0;
          blocks--;
          blockEv.push({ t: 0, c, r, left: 0 });
          start = [c, r];
          break;
        }
  }
  if (!start) {
    return {
      moves: [[0, 0, 0]],
      bombs: [],
      blockEv: [],
      T: 0,
      leftover: 0,
      total0: 0,
      R,
      FUSE,
      noEscape: 0,
      shielded: 0,
    };
  }

  let pos: Cell = [start[0], start[1]];
  let t = 0;
  const moves: Move[] = [[0, pos[0], pos[1]]];

  // Every cell a bomb *might* hit, ignoring blocks (conservative): the whole cross within R.
  function danger(b: { c: number; r: number }): Set<number> {
    const s = new Set<number>([key(b.c, b.r)]);
    for (const [d0, d1] of D)
      for (let k = 1; k <= R; k++) {
        const c = b.c + d0 * k,
          r = b.r + d1 * k;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) break;
        s.add(key(c, r));
      }
    return s;
  }

  // The real blast: it stops at the first block in each direction, and that block takes one hit.
  // With apply=false it only measures (used to predict what a new bomb will hit).
  function arms(c0: number, r0: number, apply: boolean, te?: number) {
    const res: [number, number, number, number] = [0, 0, 0, 0];
    const hitCells: Cell[] = [];
    D.forEach(([d0, d1], di) => {
      for (let k = 1; k <= R; k++) {
        const c = c0 + d0 * k,
          r = r0 + d1 * k;
        if (!inb(c, r)) break;
        if (hits[c][r] > 0) {
          res[di] = k;
          hitCells.push([c, r]);
          if (apply) {
            hits[c][r]--;
            blockEv.push({ t: te!, c, r, left: hits[c][r] });
            if (hits[c][r] === 0) blocks--;
          }
          break;
        }
        res[di] = k;
      }
    });
    return { arms: res, hitCells };
  }

  // Explode every bomb whose fuse has run out by `upto`, including chain reactions.
  function explodeDue(upto: number) {
    for (;;) {
      pending.sort((a, b) => a.te - b.te);
      if (!pending.length || pending[0].te > upto) return;
      const first = pending[0];
      const q: Bomb[] = [first];
      first.done = true;
      while (q.length) {
        const b = q.shift()!;
        pending.splice(pending.indexOf(b), 1);
        for (const p of b.pred) {
          const k = key(p[0], p[1]);
          targeted[k] = (targeted[k] || 1) - 1;
        }
        const a = arms(b.c, b.r, true, first.te).arms;
        b.teActual = first.te;
        b.arms = a;
        bombsOut.push(b);
        for (const o of pending) {
          // chain reaction: another pending bomb sits inside this blast
          if (o.done) continue;
          const inArm = D.some(([d0, d1], di) => {
            for (let k = 1; k <= a[di]; k++) if (b.c + d0 * k === o.c && b.r + d1 * k === o.r) return true;
            return false;
          });
          if (inArm) {
            o.done = true;
            q.push(o);
          }
        }
      }
    }
  }

  // The character may only step on floor that holds no bomb and is outside every pending danger zone.
  const walkable = (c: number, r: number, dg: Set<number>) =>
    inb(c, r) && hits[c][r] === 0 && !pending.some((b) => b.c === c && b.r === r) && !dg.has(key(c, r));

  function dangerAll(): Set<number> {
    const s = new Set<number>();
    for (const b of pending) for (const k of danger(b)) s.add(k);
    return s;
  }

  // Breadth-first search over walkable cells. With a goalFn it stops at the first matching cell.
  function bfs(from: Cell, dg: Set<number>, goalFn: ((c: number, r: number) => boolean) | null) {
    const prev = new Map<number, Cell>();
    const dist = new Map<number, number>();
    dist.set(key(from[0], from[1]), 0);
    const q: Cell[] = [from];
    const reach: Cell[] = [];
    while (q.length) {
      const [c, r] = q.shift()!;
      reach.push([c, r]);
      if (goalFn && goalFn(c, r) && !(c === from[0] && r === from[1]))
        return { goal: [c, r] as Cell, prev, dist, reach };
      for (const [d0, d1] of D) {
        const nc = c + d0,
          nr = r + d1,
          k = key(nc, nr);
        if (dist.has(k) || !walkable(nc, nr, dg)) continue;
        dist.set(k, dist.get(key(c, r))! + 1);
        prev.set(k, [c, r]);
        q.push([nc, nr]);
      }
    }
    return { goal: undefined, reach, prev, dist };
  }

  function pathTo(prev: Map<number, Cell>, from: Cell, to: Cell): Cell[] {
    const p: Cell[] = [];
    let cur = to;
    while (!(cur[0] === from[0] && cur[1] === from[1])) {
      p.push(cur);
      cur = prev.get(key(cur[0], cur[1]))!;
    }
    return p.reverse();
  }

  function walk(path: Cell[]) {
    for (const [c, r] of path) {
      t += STEP_T;
      moves.push([t, c, r]);
      pos = [c, r];
    }
  }

  // Before placing a bomb at `site`, make sure the character can leave its cross within the fuse time.
  function escapeOK(site: Cell): boolean {
    const hyp = { c: site[0], r: site[1], te: 0, pred: [] } as unknown as Bomb;
    pending.push(hyp);
    const dgAll = dangerAll();
    const dgOther = new Set<number>();
    for (const o of pending) if (o !== hyp) for (const k of danger(o)) dgOther.add(k);
    pending.pop();
    // The search ignores the new bomb's own cross (dgOther) on purpose: the character has to walk
    // out through it. A goal is any cell that is outside all crosses, the new one included.
    const esc = bfs(site, dgOther, (c, r) => !dgAll.has(key(c, r)));
    if (!esc.goal) return false;
    return esc.dist.get(key(esc.goal[0], esc.goal[1]))! * STEP_T <= FUSE - 0.02;
  }

  // --- main loop: pick a bomb site, walk there, place, escape -------------------------------------
  let guard = 0;
  while (blocks > 0 && guard++ < 4000) {
    explodeDue(t);
    if (blocks <= 0) break;
    const dg = dangerAll();
    const res = bfs(pos, dg, null);
    const cands: { site: Cell; v: number }[] = [];
    const here = key(pos[0], pos[1]);
    for (const [c, r] of res.reach) {
      if (dg.has(key(c, r)) && key(c, r) !== here) continue;
      // score = number of blocks (still not doomed by other bombs) this site would hit
      let sc = 0;
      for (const [d0, d1] of D)
        for (let k = 1; k <= R; k++) {
          const cc = c + d0 * k,
            rr = r + d1 * k;
          if (!inb(cc, rr)) break;
          if (hits[cc][rr] > 0) {
            if (hits[cc][rr] - (targeted[key(cc, rr)] || 0) > 0) sc++;
            break;
          }
        }
      if (sc === 0) continue;
      // greedy value: reward blocks, penalise distance
      cands.push({ site: [c, r], v: sc * 2 - res.dist.get(key(c, r))! * 0.3 });
    }
    cands.sort((a, b) => b.v - a.v);

    let best: Cell | null = null;
    let shielded = false;
    for (const cd of cands)
      if (escapeOK(cd.site)) {
        best = cd.site;
        break;
      }
    if (!best) {
      if (pending.length) {
        // nothing safe right now: wait for the next explosion and try again
        t = Math.max(t, Math.min(...pending.map((b) => b.te)));
        moves.push([t, pos[0], pos[1]]);
        continue;
      }
      // Trapped: no site has a safe escape and nothing is pending.
      // Place the best bomb anyway and protect the character with a shield (drawn as a bubble).
      if (cands.length) {
        best = cands[0].site;
        shielded = true;
      } else break;
    }

    walk(pathTo(res.prev, pos, best));
    explodeDue(t);
    t += PLACE_T;
    moves.push([t, pos[0], pos[1]]);
    const nb: Bomb = {
      c: best[0],
      r: best[1],
      tp: t,
      te: t + FUSE,
      teActual: 0,
      arms: [0, 0, 0, 0],
      pred: [],
      shielded,
    };
    nb.pred = arms(nb.c, nb.r, false).hitCells;
    for (const p of nb.pred) {
      const k = key(p[0], p[1]);
      targeted[k] = (targeted[k] || 0) + 1;
    }
    pending.push(nb);

    const dgA = dangerAll();
    const dgO = new Set<number>();
    for (const o of pending) if (o !== nb) for (const k of danger(o)) dgO.add(k);
    if (!shielded) {
      const esc = bfs(pos, dgO, (c, r) => !dgA.has(key(c, r)));
      if (esc.goal) walk(pathTo(esc.prev, pos, esc.goal));
      else nb.noEscape = true;
    }
  }

  // let the last bombs go off
  if (pending.length) {
    const lastTe = Math.max(...pending.map((b) => b.te));
    explodeDue(lastTe + 1);
    t = Math.max(t, lastTe);
    moves.push([t, pos[0], pos[1]]);
  }

  // Safety net: should never trigger, but any block still standing is cleared at the end of the plan.
  const left: { c: number; r: number; left: number }[] = [];
  hits.forEach((col, c) =>
    col.forEach((h, r) => {
      for (let i = 0; i < h; i++) left.push({ c, r, left: h - i - 1 });
    }),
  );
  let endT = t;
  for (const b of bombsOut) if (b.teActual > endT) endT = b.teActual;
  for (const l of left) blockEv.push({ t: endT, c: l.c, r: l.r, left: l.left });

  return {
    moves,
    bombs: bombsOut,
    blockEv,
    T: endT,
    leftover: left.length,
    total0,
    R,
    FUSE,
    noEscape: bombsOut.filter((b) => b.noEscape).length,
    shielded: bombsOut.filter((b) => b.shielded).length,
  };
}

/**
 * Compress a plan in time so the loop never exceeds maxSeconds. All times scale together, so every
 * relative timing (including "escape before the fuse ends") is preserved. Heavy grids simply play faster.
 */
export function fitDuration(plan: Plan, maxSeconds = 45): Plan {
  if (plan.T <= maxSeconds || plan.T === 0) return { ...plan, speedUp: 1 };
  const k = maxSeconds / plan.T;
  return {
    ...plan,
    T: plan.T * k,
    moves: plan.moves.map(([t, c, r]): Move => [t * k, c, r]),
    bombs: plan.bombs.map((b) => ({ ...b, tp: b.tp * k, te: b.te * k, teActual: b.teActual * k })),
    blockEv: plan.blockEv.map((e) => ({ ...e, t: e.t * k })),
    speedUp: 1 / k,
  };
}
