// Renders a plan (from planner.ts) into a self-contained animated SVG string.
// No scripts: CSS keyframes only (no SMIL), so it works inside <img> on GitHub.
//
// Techniques that must not be broken (see README "How it works"):
//  - the character is moved by a CSS @keyframes of translate() so the whole picture shares one clock (no SMIL)
//  - every block has its own @keyframes, with percentages taken from the hit time over the loop length
//  - one-shot effects use a POSITIVE animation-delay (= event time), base opacity 0 and infinite repeat,
//    which keeps them in sync on every loop. Never use animation-fill-mode: backwards for this.
import { COLS, ROWS } from "./types.ts";
import type { Grid, LevelFn, Plan, Theme } from "./types.ts";

// pitch between cells, cell size, and how long the finished board stays on screen before the loop restarts
const STEP = 14,
  CELL = 11,
  HOLD = 3.5;
// above this many blocks only 2 debris shards are drawn per block (the file would get too big otherwise)
const BUSY_BLOCKS = 250;

export interface Palette {
  l0: string;
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  /** colour of the crack drawn on a damaged level-4 block */
  crk: string;
  bomb: string;
  bombStroke: string;
  /** colour of the "all clear" caption */
  tx: string;
}

export const PALETTES: Record<Theme, Palette> = {
  light: {
    l0: "#ebedf0",
    l1: "#9be9a8",
    l2: "#40c463",
    l3: "#30a14e",
    l4: "#216e39",
    crk: "#ffffff",
    bomb: "#2b2f3a",
    bombStroke: "#2b2f3a",
    tx: "#57606a",
  },
  dark: {
    l0: "#161b22",
    l1: "#0e4429",
    l2: "#006d32",
    l3: "#26a641",
    l4: "#39d353",
    crk: "#0d1117",
    bomb: "#1b1f27",
    bombStroke: "#9da7b3",
    tx: "#9da7b3",
  },
};

// The character: a round white helmet with a blue visor, two eyes, a pink antenna ball, and two little feet.
// It is drawn around (0,0) so a CSS translate() can place it on any cell centre.
const sprite = () =>
  '<ellipse cx="-2.2" cy="4.6" rx="1.7" ry="1.1" fill="#3b4a6b"/><ellipse cx="2.2" cy="4.6" rx="1.7" ry="1.1" fill="#3b4a6b"/>' +
  '<circle r="4.7" fill="#f5f7fa" stroke="#3b4a6b" stroke-width="1"/><rect x="-3.6" y="1" width="7.2" height="2.4" rx="1.2" fill="#4c6fff"/>' +
  '<circle cx="-1.6" cy="-0.8" r="0.8" fill="#222"/><circle cx="1.6" cy="-0.8" r="0.8" fill="#222"/>' +
  '<path d="M0,-4.6 L0,-5.8" stroke="#3b4a6b" stroke-width="0.8"/><circle cy="-6.2" r="1.5" fill="#ff4d6d"/>';

const DESC = (total: number) =>
  `An animated Bomberman level built from a GitHub contribution graph (${total} contributions). A character places bombs that blow up the commit blocks, one by one, until the board is clear.`;

// `scale` only changes the size the image is shown at (width/height); the drawing itself uses a fixed
// viewBox, so every shape and animation scales together and stays sharp.
export function renderSvg(weeks: Grid, lvl: LevelFn, plan: Plan, theme: Theme | Palette = "light", scale = 1): string {
  const P = typeof theme === "string" ? PALETTES[theme] : theme;
  const W = COLS * STEP,
    H = ROWS * STEP;
  const T = plan.T,
    C = T + HOLD, // loop length = plan + hold
    F = T / C,
    CS = C.toFixed(2);

  // block (by cell key) -> times it was hit
  const evBy: Record<number, number[]> = {};
  for (const e of plan.blockEv) (evBy[e.c * ROWS + e.r] ||= []).push(e.t);

  let floor = "",
    blocksSvg = "",
    css = "",
    debris = "",
    total = 0;
  const WIN = ((0.8 / C) * 100).toFixed(2); // how long debris flies, as a % of the loop
  let blockCount = 0;
  for (const col of weeks) for (const n of col) if (n !== null && n > 0) blockCount++;
  const shards = blockCount > BUSY_BLOCKS ? 2 : 4;

  // --- floor, blocks and debris ------------------------------------------------------------------
  for (let i = 0; i < COLS; i++)
    for (let r = 0; r < ROWS; r++) {
      const n = weeks[i][r];
      if (n === null) continue;
      total += n;
      const bx = i * STEP,
        by = r * STEP,
        key = i * ROWS + r;
      // every existing day gets a floor tile; blocks are drawn on top of it
      floor += `<rect class="l0" x="${bx}" y="${by}" width="${CELL}" height="${CELL}" rx="2"/>`;
      if (!(n > 0 && evBy[key])) continue;

      const ev = evBy[key].slice().sort((a, b) => a - b),
        ts = ev.map((q) => (q / C) * 100),
        two = ts.length >= 2, // a tough (level 4) block: first hit cracks it, second destroys it
        p1 = ts[0],
        L = lvl(n);
      let kf: string;
      if (two) {
        const p2 = Math.max(ts[1], p1 + 1);
        kf = `0%,${p1.toFixed(2)}%{opacity:1;transform:scale(1)}${(p1 + 0.3).toFixed(2)}%{opacity:1;transform:scale(1.2)}${(p1 + 0.7).toFixed(2)}%,${p2.toFixed(2)}%{opacity:1;transform:scale(1)}${(p2 + 0.3).toFixed(2)}%{opacity:1;transform:scale(1.3)}${(p2 + 0.9).toFixed(2)}%,100%{opacity:0;transform:scale(.6)}`;
      } else {
        kf = `0%,${p1.toFixed(2)}%{opacity:1;transform:scale(1)}${(p1 + 0.3).toFixed(2)}%{opacity:1;transform:scale(1.3)}${(p1 + 0.9).toFixed(2)}%,100%{opacity:0;transform:scale(.6)}`;
      }
      css += `@keyframes b${key}{${kf}}`;

      let crack = "";
      if (two) {
        css += `@keyframes k${key}{0%,${(p1 - 0.01).toFixed(2)}%{opacity:0}${p1.toFixed(2)}%,100%{opacity:1}}`;
        crack = `<path class="crk" d="M${bx + 3},${by + 1} L${bx + 6},${by + 5} L${bx + 4},${by + 7} L${bx + 8},${by + 10}" style="animation:k${key} ${CS}s linear infinite"/>`;
      }
      blocksSvg += `<g class="c" style="animation:b${key} ${CS}s linear infinite"><rect class="l${L}" x="${bx}" y="${by}" width="${CELL}" height="${CELL}" rx="2"/><rect class="in" x="${bx + 2}" y="${by + 2}" width="7" height="7" rx="1"/>${crack}</g>`;

      // shards fly out when the block is finally destroyed (fewer on busy boards to keep the file small)
      const td = ev[ev.length - 1].toFixed(2);
      for (let s = 1; s <= shards; s++)
        debris += `<rect class="s d${s} l${L}" x="${bx + 4}" y="${by + 4}" width="3.5" height="3.5" rx="0.8" style="animation-delay:${td}s"/>`;
    }

  // one keyframe per shard direction
  const dirs = [
    [-11, -9],
    [11, -9],
    [-8, 9],
    [8, 9],
  ];
  const shKf = dirs
    .map(
      (d, k) =>
        `@keyframes sh${k + 1}{0%{opacity:1;transform:translate(0,0) scale(1)}${WIN}%{opacity:0;transform:translate(${d[0]}px,${d[1]}px) scale(.3)}100%{opacity:0;transform:translate(${d[0]}px,${d[1]}px) scale(.3)}}`,
    )
    .join("");

  // --- bombs, flames and shields -----------------------------------------------------------------
  let fx = "",
    bombs = "",
    shields = "";
  const FW = (0.4 / C) * 100; // how long the flames stay visible, as a % of the loop
  plan.bombs.forEach((b, k) => {
    const cx = b.c * STEP + 5.5,
      cy = b.r * STEP + 5.5,
      a = b.arms; // [right, left, down, up]
    const x0 = (b.c - a[1]) * STEP - 1.5,
      x1 = (b.c + a[0]) * STEP + 12.5,
      y0 = (b.r - a[3]) * STEP - 1.5,
      y1 = (b.r + a[2]) * STEP + 12.5;
    // flames: an orange cross with a yellow core
    fx += `<g class="fx" style="animation-delay:${b.teActual.toFixed(2)}s"><rect class="fo" x="${x0}" y="${cy - 4.5}" width="${x1 - x0}" height="9" rx="3"/><rect class="fo" x="${cx - 4.5}" y="${y0}" width="9" height="${y1 - y0}" rx="3"/><rect class="fi" x="${x0 + 2}" y="${cy - 2}" width="${x1 - x0 - 4}" height="4" rx="2"/><rect class="fi" x="${cx - 2}" y="${y0 + 2}" width="4" height="${y1 - y0 - 4}" rx="2"/></g>`;

    // the bomb is visible from placement until it explodes
    const pe = ((b.teActual - b.tp) / C) * 100;
    css += `@keyframes bm${k}{0%,${Math.max(pe - 0.01, 0).toFixed(3)}%{opacity:1}${pe.toFixed(3)}%,100%{opacity:0}}`;
    bombs += `<g class="bm" style="animation-name:bm${k};animation-duration:${CS}s;animation-delay:${b.tp.toFixed(2)}s"><g transform="translate(${cx},${cy})"><g class="pl"><circle r="4" class="bb"/><circle cx="-1.3" cy="-1.3" r="1.1" fill="#fff" opacity=".5"/></g><circle class="spk" cx="2.8" cy="-4.2" r="1.5"/></g></g>`;

    if (b.shielded) {
      // the shield bubble lasts a little longer than the explosion
      const ps = ((b.teActual + 0.45 - b.tp) / C) * 100;
      css += `@keyframes sd${k}{0%,${Math.max(ps - 0.01, 0).toFixed(3)}%{opacity:1}${ps.toFixed(3)}%,100%{opacity:0}}`;
      shields += `<circle class="shd" cx="${cx}" cy="${cy}" r="8" style="animation-name:sd${k};animation-duration:${CS}s;animation-delay:${b.tp.toFixed(2)}s"/>`;
    }
  });

  // --- the character -------------------------------------------------------------------------------
  // The character is moved by a CSS animation, like everything else, so the whole picture runs on ONE
  // clock. (An earlier version used SMIL <animateMotion>; SMIL and CSS clocks start independently, so the
  // character could be a little ahead of or behind the bombs and flames.)
  // Every point of the walk becomes a keyframe. Straight runs at constant speed are merged into one
  // segment, because the browser interpolates linearly between keyframes anyway; pauses stay as two
  // keyframes with the same position.
  const pt = (m: [number, number, number]): [number, number, number] => [m[0], m[1] * STEP + 5.5, m[2] * STEP + 5.5];
  const pts = plan.moves.map(pt);
  let walker: string;
  if (pts.length < 2) {
    walker = `<g class="w" transform="translate(${pts[0][1]},${pts[0][2]})">${sprite()}</g>`;
  } else {
    const kept: [number, number, number][] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = kept[kept.length - 1],
        b = pts[i],
        c = pts[i + 1];
      const dt1 = b[0] - a[0],
        dt2 = c[0] - b[0];
      // same velocity before and after this point => it is on a straight constant-speed run
      const same =
        dt1 > 1e-9 &&
        dt2 > 1e-9 &&
        Math.abs((b[1] - a[1]) / dt1 - (c[1] - b[1]) / dt2) < 1e-6 &&
        Math.abs((b[2] - a[2]) / dt1 - (c[2] - b[2]) / dt2) < 1e-6;
      if (!same) kept.push(b);
    }
    kept.push(pts[pts.length - 1]);
    const frame = ([t, x, y]: [number, number, number]) =>
      `${+((t / C) * 100).toFixed(3)}%{transform:translate(${x}px,${y}px)}`;
    // it stands on its last cell until the loop restarts
    const last = kept[kept.length - 1];
    css += `@keyframes walk{${kept.map(frame).join("")}100%{transform:translate(${last[1]}px,${last[2]}px)}}`;
    walker = `<g class="w">${sprite()}</g>`;
  }

  // --- assemble ------------------------------------------------------------------------------------
  const fin = (F * 100).toFixed(1),
    fin2 = (F * 100 + 3).toFixed(1);
  const totalStr = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${W + 8} ${H + 34}" width="${+((W + 8) * scale).toFixed(2)}" height="${+((H + 34) * scale).toFixed(2)}" role="img"><title>Commit Bomberman</title><desc>${DESC(total)}</desc><style>` +
    `.l0{fill:${P.l0}}.l1{fill:${P.l1}}.l2{fill:${P.l2}}.l3{fill:${P.l3}}.l4{fill:${P.l4}}.in{fill:none;stroke:rgba(255,255,255,.4);stroke-width:1}.crk{fill:none;stroke:${P.crk};stroke-width:1;stroke-linecap:round;opacity:0}` +
    `.w{animation:walk ${CS}s linear infinite}.c{transform-box:fill-box;transform-origin:center}.bb{fill:${P.bomb};stroke:${P.bombStroke};stroke-width:1}.tx{fill:${P.tx};font:500 13px sans-serif}.fo{fill:#ff8a1f}.fi{fill:#ffe27a}` +
    `.s{opacity:0;transform-box:fill-box;transform-origin:center;animation-duration:${CS}s;animation-iteration-count:infinite;animation-timing-function:ease-out}.d1{animation-name:sh1}.d2{animation-name:sh2}.d3{animation-name:sh3}.d4{animation-name:sh4}` +
    `.fx{opacity:0;animation:fx ${CS}s linear infinite}@keyframes fx{0%{opacity:1}${(FW * 0.6).toFixed(3)}%{opacity:1}${FW.toFixed(3)}%{opacity:0}100%{opacity:0}}` +
    `.bm{opacity:0;animation-iteration-count:infinite;animation-timing-function:linear}.shd{fill:rgba(76,201,240,.2);stroke:#4cc9f0;stroke-width:1;opacity:0;animation-iteration-count:infinite;animation-timing-function:linear}.pl{transform-box:fill-box;transform-origin:center;animation:pulse .28s ease-in-out infinite alternate}@keyframes pulse{from{transform:scale(1)}to{transform:scale(1.18)}}.spk{fill:#ffb02e;animation:blink .16s steps(2) infinite}@keyframes blink{50%{opacity:.2}}` +
    `.fin{opacity:0;animation:fin ${CS}s linear infinite}@keyframes fin{0%,${fin}%{opacity:0}${fin2}%,96%{opacity:1}100%{opacity:0}}` +
    shKf +
    css +
    // Reduced motion: no animation at all. The board is shown as a plain contribution graph, because
    // everything that appears during the game (bombs, flames, debris, caption) has opacity 0 by default.
    // The character is hidden because it would otherwise stand still on top of the board.
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}.w{display:none}}` +
    `</style>` +
    floor +
    blocksSvg +
    debris +
    fx +
    bombs +
    walker +
    shields +
    `<text class="tx fin" x="${W / 2}" y="${H + 22}" text-anchor="middle">all clear &#183; ${totalStr} commits</text></svg>`
  );
}
