# Contributing

Thanks for helping! Small, focused pull requests are easiest to review.

## Setup

```bash
npm ci
npm test
```

Node 20 or newer is required.

## Useful commands

```bash
npm test                 # unit, property and smoke tests
npm run typecheck && npm run lint
npm run build            # bundles src/ into dist/index.js (commit the result)
npm run generate -- --grid fixtures/pachara-n-calendar.json --out out --scale 1.17   # offline preview
GH_USER=your-name npm run generate -- --out out                                      # live data
```

`dist/index.js` is committed on purpose: GitHub runs it directly, and CI fails when it is out of date.

## How it works

- The 53 x 7 grid is the last year. A day with commits is a block (shade 1 to 4 from GitHub; level 4 needs two hits), a
  day without is floor.
- A bomb blasts in a cross up to `radius` cells and stops at the first block in each direction.
- The character only walks on floor and always leaves the cross before the fuse ends. It picks the next bomb site
  greedily (more blocks hit is better, a long walk is worse). If it is trapped it places the bomb anyway and shows a
  blue shield.
- Busy years are sped up so the loop never exceeds `max_seconds`.
- Character, bombs, flames and blocks all run on one SMIL timeline, so they cannot drift apart, even on a slow device.

## What is tested

Automatically (`npm test`): the planner on edge cases and 150 random boards (it terminates, nothing is left, the
character is never inside a blast), SVG well-formedness and animation timing, option parsing, fetching with a fake
`fetch`, a snapshot of the output for a real graph, and the CLI. By hand in Chrome: playback, reduced motion, and the
character following the plan under a throttled CPU. The action also ran on GitHub (GraphQL source).

Not tested: Firefox and Safari, real phones.

## Before you open a pull request

- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` all pass.
- If you changed anything in `src/`, run `npm run build` and commit the updated `dist/index.js` (CI checks this).
- If you changed how the SVG looks on purpose, open the new SVG in a browser, then refresh the snapshot with
  `UPDATE_SNAPSHOT=1 npm test` and commit `test/fixture.snapshot.json`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for messages (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`).

## Ground rules

- The renderer must stay pure SVG with no scripts. Everything that depends on time must be a SMIL animation on the one shared timeline (same `dur`, `begin="0s"`); do not mix in CSS animations that carry timing, because each CSS animation gets its own start time and they can drift apart on slow devices.
- Do not copy code, art or text from other projects.
- Please say clearly what you tested and what you did not.

## Reporting bugs

Open an issue with the workflow log (remove tokens), your `outputs` input, and which browser shows the problem.
