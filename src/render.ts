// Renders a plan (from planner.ts) into a self-contained animated SVG string.
// No scripts: SMIL animation only, so it works inside <img> on GitHub.
//
// Techniques that must not be broken (see README "How it works"):
//  - EVERYTHING that depends on time (character, blocks, bombs, flames, shields, caption) is a SMIL <animate>
//    with begin 0 and the same dur. SMIL has one document timeline, so all of them are evaluated at the same
//    time t and cannot drift apart. (CSS animations each get their own start time; on a busy or slow device
//    the browser starts them in different frames, which showed up as the character being up to 0.2 s off.)
//  - one-shot effects use calcMode="discrete" with keyTimes taken from the planned event time over the loop length
//  - purely cosmetic loops that carry no information (bomb pulse, fuse spark) stay as small CSS animations
import { COLS, ROWS } from "./types.ts";
import type { Grid, LevelFn, Plan, Theme } from "./types.ts";

// pitch between cells, cell size, and how long the finished board stays on screen before the loop restarts
const STEP = 14,
  CELL = 11,
  HOLD = 3.5;
// how long a destroyed block takes to fade away, and how long the flames stay, in seconds
const FADE = 0.25,
  FLAME = 0.4;

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
// It is drawn around (0,0) so a translate() can place it on any cell centre.
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
  // Loop length = plan + hold. It is rounded first, so the dur written in the file and the fractions
  // computed below use exactly the same number.
  const C = +(plan.T + HOLD).toFixed(2),
    DUR = `${C}s`;

  // a time in seconds as a fraction of the loop, clamped to [0,1]
  const f = (t: number) => +Math.min(Math.max(t / C, 0), 1).toFixed(5);
  // a SMIL <animate>/<animateTransform> that starts with the document and repeats every loop
  const smil = (tag: string, attrs: string) => `<${tag} ${attrs} dur="${DUR}" begin="0s" repeatCount="indefinite"/>`;
  // an element that is invisible except between two times (each effect repeats every loop)
  const visibleBetween = (from: number, to: number) =>
    smil("animate", `attributeName="opacity" calcMode="discrete" values="0;1;0" keyTimes="0;${f(from)};${f(to)}"`);

  // block (by cell key) -> times it was hit
  const evBy: Record<number, number[]> = {};
  for (const e of plan.blockEv) (evBy[e.c * ROWS + e.r] ||= []).push(e.t);

  let floor = "",
    blocksSvg = "",
    staticBlocks = "",
    total = 0;

  // --- floor and blocks -----------------------------------------------------------------------------
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
      if (!(n > 0)) continue;

      const L = lvl(n);
      const body = `<rect class="l${L}" x="${bx}" y="${by}" width="${CELL}" height="${CELL}" rx="2"/><rect class="in" x="${bx + 2}" y="${by + 2}" width="7" height="7" rx="1"/>`;
      // the same block without any animation, shown when the viewer asks for reduced motion
      staticBlocks += `<g>${body}</g>`;

      const ev = (evBy[key] ?? []).slice().sort((a, b) => a - b);
      if (!ev.length) {
        blocksSvg += `<g>${body}</g>`;
        continue;
      }
      const tHit = ev[0],
        tGone = ev[ev.length - 1]; // a tough (level 4) block is only destroyed by its second hit
      // visible until it is destroyed, then fades out and stays gone until the loop restarts
      const fade = smil(
        "animate",
        `attributeName="opacity" calcMode="linear" values="1;1;0;0" keyTimes="0;${f(tGone)};${f(tGone + FADE)};1"`,
      );
      let crack = "";
      if (ev.length >= 2) {
        // first hit leaves a crack
        crack = `<path class="crk" opacity="0" d="M${bx + 3},${by + 1} L${bx + 6},${by + 5} L${bx + 4},${by + 7} L${bx + 8},${by + 10}">${smil(
          "animate",
          `attributeName="opacity" calcMode="discrete" values="0;1" keyTimes="0;${f(tHit)}"`,
        )}</path>`;
      }
      blocksSvg += `<g>${fade}${body}${crack}</g>`;
    }

  // --- bombs, flames and shields -----------------------------------------------------------------
  let fx = "",
    bombs = "",
    shields = "";
  plan.bombs.forEach((b) => {
    const cx = b.c * STEP + 5.5,
      cy = b.r * STEP + 5.5,
      a = b.arms; // [right, left, down, up]
    const x0 = (b.c - a[1]) * STEP - 1.5,
      x1 = (b.c + a[0]) * STEP + 12.5,
      y0 = (b.r - a[3]) * STEP - 1.5,
      y1 = (b.r + a[2]) * STEP + 12.5;
    // flames: an orange cross with a yellow core, visible for a moment when the bomb explodes
    fx += `<g opacity="0">${visibleBetween(b.teActual, b.teActual + FLAME)}<rect class="fo" x="${x0}" y="${cy - 4.5}" width="${x1 - x0}" height="9" rx="3"/><rect class="fo" x="${cx - 4.5}" y="${y0}" width="9" height="${y1 - y0}" rx="3"/><rect class="fi" x="${x0 + 2}" y="${cy - 2}" width="${x1 - x0 - 4}" height="4" rx="2"/><rect class="fi" x="${cx - 2}" y="${y0 + 2}" width="4" height="${y1 - y0 - 4}" rx="2"/></g>`;

    // the bomb is visible from placement until it explodes
    bombs += `<g opacity="0">${visibleBetween(b.tp, b.teActual)}<g transform="translate(${cx},${cy})"><g class="pl"><circle r="4" class="bb"/><circle cx="-1.3" cy="-1.3" r="1.1" fill="#fff" opacity=".5"/></g><circle class="spk" cx="2.8" cy="-4.2" r="1.5"/></g></g>`;

    if (b.shielded) {
      // the shield bubble lasts a little longer than the explosion
      shields += `<circle class="shd" opacity="0" cx="${cx}" cy="${cy}" r="8">${visibleBetween(b.tp, b.teActual + 0.45)}</circle>`;
    }
  });

  // --- the character -------------------------------------------------------------------------------
  // Every point of the walk is a keyTime/value pair of one animateTransform. Straight runs at constant speed
  // are merged into one segment (the browser interpolates linearly anyway); a pause is two points with the
  // same position. It stands on its last cell until the loop restarts.
  const pts = plan.moves.map((m): [number, number, number] => [m[0], m[1] * STEP + 5.5, m[2] * STEP + 5.5]);
  let walker: string;
  if (pts.length < 2) {
    walker = `<g transform="translate(${pts[0][1]},${pts[0][2]})">${sprite()}</g>`;
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
    const last = kept[kept.length - 1];
    const keyTimes = kept.map((p) => f(p[0])).concat([1]);
    const values = kept.map((p) => `${p[1]} ${p[2]}`).concat([`${last[1]} ${last[2]}`]);
    walker = `<g>${smil(
      "animateTransform",
      `attributeName="transform" type="translate" calcMode="linear" keyTimes="${keyTimes.join(";")}" values="${values.join(";")}"`,
    )}${sprite()}</g>`;
  }

  // --- caption: appears once everything is destroyed, fades out before the loop restarts ---------------
  const totalStr = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const caption = `<text class="tx" opacity="0" x="${W / 2}" y="${H + 22}" text-anchor="middle">${smil(
    "animate",
    `attributeName="opacity" calcMode="linear" values="0;0;1;1;0" keyTimes="0;${f(plan.T)};${f(plan.T + 0.5)};0.96;1"`,
  )}all clear &#183; ${totalStr} commits</text>`;

  // --- assemble ------------------------------------------------------------------------------------
  // Reduced motion: the animated layer is hidden and the plain board (static copy of the blocks) is shown.
  // CSS can switch a whole group off, but it cannot stop SMIL inside it, so the groups are swapped instead.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${W + 8} ${H + 34}" width="${+((W + 8) * scale).toFixed(2)}" height="${+((H + 34) * scale).toFixed(2)}" role="img"><title>Commit Bomberman</title><desc>${DESC(total)}</desc><style>` +
    `.l0{fill:${P.l0}}.l1{fill:${P.l1}}.l2{fill:${P.l2}}.l3{fill:${P.l3}}.l4{fill:${P.l4}}.in{fill:none;stroke:rgba(255,255,255,.4);stroke-width:1}.crk{fill:none;stroke:${P.crk};stroke-width:1;stroke-linecap:round}` +
    `.bb{fill:${P.bomb};stroke:${P.bombStroke};stroke-width:1}.tx{fill:${P.tx};font:500 13px sans-serif}.fo{fill:#ff8a1f}.fi{fill:#ffe27a}` +
    `.shd{fill:rgba(76,201,240,.2);stroke:#4cc9f0;stroke-width:1}` +
    // cosmetic only: the bomb pulses and its spark blinks; neither carries any timing information
    `.pl{transform-box:fill-box;transform-origin:center;animation:pulse .28s ease-in-out infinite alternate}@keyframes pulse{from{transform:scale(1)}to{transform:scale(1.18)}}.spk{fill:#ffb02e;animation:blink .16s steps(2) infinite}@keyframes blink{50%{opacity:.2}}` +
    `.rm{display:none}@media (prefers-reduced-motion:reduce){.anim{display:none}.rm{display:inline}}` +
    `</style>` +
    floor +
    `<g class="anim">${blocksSvg}${fx}${bombs}${walker}${shields}${caption}</g>` +
    `<g class="rm">${staticBlocks}</g>` +
    `</svg>`
  );
}
