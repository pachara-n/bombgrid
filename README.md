# bombgrid

> Your GitHub contribution graph, played as a game of Bomberman.

[![CI](https://github.com/pachara-n/bombgrid/actions/workflows/ci.yml/badge.svg)](https://github.com/pachara-n/bombgrid/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/pachara-n/bombgrid)](https://github.com/pachara-n/bombgrid/releases)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/pachara-n/bombgrid/output/bombgrid-dark.svg">
  <img alt="A contribution graph played as a game of Bomberman" src="https://raw.githubusercontent.com/pachara-n/bombgrid/output/bombgrid.svg">
</picture>

A character walks over your last year of commits and blows up the blocks one by one. The result is a plain SVG (no
scripts, no GIF) that works in a profile README, with the same shades GitHub shows on your graph.

## Usage

Create `.github/workflows/bombgrid.yml` in your profile repository (the one named like your username), then run it once
from the **Actions** tab:

```yaml
name: Generate bombgrid

on:
  schedule:
    - cron: "0 0 * * *" # every day
  workflow_dispatch:

permissions:
  contents: write # to push the output branch

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

Then add this to your profile `README.md` (replace `YOUR_NAME`):

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

## Options

`github_user_name` is required. `github_token` defaults to the workflow token (without a token the public page is
scraped instead). Each line of `outputs` is `path[?options]`, with options joined by `&`:

| Option        | Values                     | Default | Meaning                                                           |
| ------------- | -------------------------- | ------- | ----------------------------------------------------------------- |
| `palette`     | `light`, `dark`            | `light` | Board colours.                                                    |
| `colors`      | 5 hex values, level 0 to 4 |         | Custom colours, e.g. `colors=ebedf0,9be9a8,40c463,30a14e,216e39`. |
| `scale`       | 0.5 to 4                   | `1`     | Display size. `1` is 750 px wide, `1.17` is about 880 px.         |
| `max_seconds` | 5 to 120                   | `45`    | Busy years are sped up so the loop never lasts longer than this.  |
| `radius`      | 1 to 6                     | `2`     | How many cells a blast reaches.                                   |

The action's `files` output lists the written paths.

## Good to know

- An SVG in an `<img>` follows your **operating system** colour scheme, not the theme switch on github.com, so light and
  dark are two files shown through `<picture>`. With reduced motion turned on, the SVG shows the plain graph.
- Not tested yet: Firefox, Safari, and other users' graphs through the default `GITHUB_TOKEN` (if it cannot read them,
  pass a personal access token as `github_token`). The public-page fallback can break whenever GitHub changes its HTML.
- A typical year is about 140 KB (about 11 KB gzipped).

Want to hack on it? See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
