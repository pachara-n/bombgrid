# Contributing

Thanks for helping! Small, focused pull requests are easiest to review.

## Setup

```bash
npm ci
npm test
```

Node 20 or newer is required.

## Before you open a pull request

- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` all pass.
- If you changed anything in `src/`, run `npm run build` and commit the updated `dist/index.js` (CI checks this).
- If you changed how the SVG looks on purpose, open the new SVG in a browser, then refresh the snapshot with
  `UPDATE_SNAPSHOT=1 npm test` and commit `test/fixture.snapshot.json`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for messages (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`).

## Ground rules

- The renderer must stay pure SVG: CSS keyframes only (one clock for everything, no SMIL), no scripts.
- Do not copy code, art or text from other projects.
- Please say clearly what you tested and what you did not.

## Reporting bugs

Open an issue with the workflow log (remove tokens), your `outputs` input, and which browser shows the problem.
