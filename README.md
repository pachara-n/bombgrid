# bombgrid

> Your GitHub contribution graph, played as a game of Bomberman.

[![CI](https://github.com/pachara-n/bombgrid/actions/workflows/ci.yml/badge.svg)](https://github.com/pachara-n/bombgrid/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/pachara-n/bombgrid)](https://github.com/pachara-n/bombgrid/releases)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/pachara-n/bombgrid/output/bombgrid-dark.svg">
  <img alt="A contribution graph played as a game of Bomberman" src="https://raw.githubusercontent.com/pachara-n/bombgrid/output/bombgrid.svg">
</picture>

A little character walks over your last year of commits, drops bombs, and blows up the commit blocks one by one. It is a
plain SVG (SMIL animation only, no scripts, no GIF), so it works inside a profile README. The colours are the shades
GitHub shows on your own graph. The image above is rebuilt every day by this repository.

## Quick start

1. In your profile repository (the one named like your username) create `.github/workflows/bombgrid.yml`:

   ```yaml
   name: Generate bombgrid

   on:
     schedule:
       - cron: "0 0 * * *" # every day at midnight UTC
     workflow_dispatch: # lets you run it by hand

   permissions:
     contents: write # needed to push the output branch

   jobs:
     generate:
       runs-on: ubuntu-latest
       timeout-minutes: 10
       steps:
         - uses: actions/checkout@v7
         - uses: pachara-n/bombgrid@v1
           with:
             github_user_name: ${{ github.repository_owner }}
             outputs: |
               dist/bombgrid.svg
               dist/bombgrid-dark.svg?palette=dark
         - name: Publish to the output branch
           run: |
             cd dist
             git init -q -b output
             git config user.name "github-actions[bot]"
             git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
             git add .
             git commit -q -m "chore: update bombgrid"
             git push -f "https://x-access-token:${{ github.token }}@github.com/${{ github.repository }}.git" output
   ```

2. Open the **Actions** tab, pick **Generate bombgrid** and press **Run workflow**. When it is green, a branch called
   `output` holds the two SVG files.
3. Show them in your profile `README.md` (replace `YOUR_NAME`):

   ```html
   <picture>
     <source
       media="(prefers-color-scheme: dark)"
       srcset="https://raw.githubusercontent.com/YOUR_NAME/YOUR_NAME/output/bombgrid-dark.svg"
     />
     <img
       alt="My contributions as a game of Bomberman"
       src="https://raw.githubusercontent.com/YOUR_NAME/YOUR_NAME/output/bombgrid.svg"
     />
   </picture>
   ```

The same file is in [examples/profile-workflow.yml](examples/profile-workflow.yml).

## Inputs

| Input              | Required | Default                                                       | What it does                                                                                    |
| ------------------ | -------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `github_user_name` | yes      |                                                               | GitHub login whose graph is drawn.                                                              |
| `github_token`     | no       | `${{ github.token }}`                                         | Reads the calendar through the GraphQL API. Without a token the public page is scraped instead. |
| `outputs`          | no       | `dist/bombgrid.svg` and `dist/bombgrid-dark.svg?palette=dark` | One file per line as `path[?options]`.                                                          |

Options go after `?` and are joined with `&`, for example `dist/bombgrid.svg?scale=1.17&max_seconds=30`:

| Option        | Values                     | Default | Meaning                                                                                        |
| ------------- | -------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `palette`     | `light`, `dark`            | `light` | Colours of the board.                                                                          |
| `colors`      | 5 hex values, level 0 to 4 |         | Custom board colours, e.g. `colors=ebedf0,9be9a8,40c463,30a14e,216e39`.                        |
| `scale`       | 0.5 to 4                   | `1`     | Size the image is shown at. `1` is 750 px wide, `1.17` is about 880 px. Only the size changes. |
| `max_seconds` | 5 to 120                   | `45`    | The loop is sped up so it never lasts longer than this.                                        |
| `radius`      | 1 to 6                     | `2`     | How many cells a blast reaches.                                                                |

The action has one output, `files`: the written paths, one per line.

## Light and dark mode

Light and dark are two files shown through `<picture>`. An SVG inside an `<img>` follows your **operating system**
colour scheme, not the theme switch on github.com, so a visitor whose system and GitHub theme disagree can see the other
one. If the visitor asks the system for reduced motion, the SVG shows the plain graph with no animation.

## How it works

- The 53 x 7 grid is your last year. A day with commits is a block, a day without is floor.
- Blocks use the shade GitHub gives that day (1 to 4). Level 4 blocks need two hits.
- A bomb blasts in a cross up to `radius` cells and stops at the first block in each direction.
- The character only walks on floor and always leaves the cross before the fuse ends. It picks the next bomb site
  greedily: more blocks hit is better, a long walk is worse. If it is ever trapped it places the bomb anyway and shows a
  blue shield.
- Busy years are sped up so the loop never exceeds `max_seconds`.
- Character, bombs, flames and blocks all run on one SMIL timeline, so they cannot drift apart, even on a slow device.

## What is tested, and what is not

Tested automatically (`npm test`): the planner on edge cases and 150 random boards (it terminates, nothing is left, the
character is never inside a blast), SVG well-formedness, option parsing, fetching with a fake `fetch`, a snapshot of the
output for a real graph, and the CLI. Checked by hand in Chrome: playback, the reduced-motion fallback, and that the
character follows the plan. The action also ran on GitHub (GraphQL source) and produced a working profile image.

**Not tested yet:** Firefox and Safari, and graphs of other users through the default `GITHUB_TOKEN` (if it is not
allowed to read them, pass a personal access token as `github_token`). The public-page fallback depends on the current
GitHub HTML and can break at any time.

Size is about 180 KB for a typical year (about 16 KB gzipped) and up to roughly 420 KB for a completely full board.

## Development

```bash
npm ci
npm test                 # unit, property and smoke tests
npm run typecheck && npm run lint
npm run build            # bundles src/ into dist/index.js (commit the result)
npm run generate -- --grid fixtures/pachara-n-calendar.json --out out --scale 1.17   # offline preview
GH_USER=your-name npm run generate -- --out out                                      # live data
```

`dist/index.js` is committed on purpose: GitHub runs it directly, and CI fails when it is out of date. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
