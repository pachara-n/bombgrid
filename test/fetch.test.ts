// Fetching is tested with a fake `fetch`, so no network or token is needed.
// NOTE: this does NOT prove GitHub still answers like this; see README "What is tested".
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLS, ROWS } from "../src/types.ts";
import { fetchGrid, normalizeGrid } from "../src/fetch/index.ts";
import { parseContributionsHtml } from "../src/fetch/html-fallback.ts";

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

test("normalizeGrid pads and trims to 53x7", () => {
  const short = normalizeGrid([[1, 2, 3]]);
  assert.equal(short.length, COLS);
  assert.ok(short.every((c) => c.length === ROWS));
  // the real week is the last column, the padding on the left is all walls
  assert.deepEqual(short[COLS - 1], [1, 2, 3, null, null, null, null]);
  assert.ok(short[0].every((v) => v === null));

  const long = normalizeGrid(Array.from({ length: 60 }, (_, i) => Array(ROWS).fill(i)));
  assert.equal(long.length, COLS);
  assert.equal(long[0][0], 7); // oldest 7 weeks dropped
});

test("GraphQL: maps weekday to row and leaves missing days null", async () => {
  let sentAuth = "";
  const fake = (async (_url: unknown, init: RequestInit) => {
    sentAuth = (init.headers as Record<string, string>).Authorization;
    return jsonResponse({
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              weeks: [
                {
                  contributionDays: [
                    { contributionCount: 4, weekday: 0 },
                    { contributionCount: 0, weekday: 1 },
                  ],
                },
                { contributionDays: [{ contributionCount: 9, weekday: 6 }] },
              ],
            },
          },
        },
      },
    });
  }) as unknown as typeof fetch;

  const { weeks, source } = await fetchGrid({ user: "octo", token: "t0k3n", fetchImpl: fake });
  assert.equal(source, "GraphQL API");
  assert.equal(sentAuth, "bearer t0k3n");
  assert.deepEqual(weeks[COLS - 2], [4, 0, null, null, null, null, null]);
  assert.equal(weeks[COLS - 1][6], 9);
});

test("falls back to the public page when GraphQL fails, and warns", async () => {
  const html =
    `<td id="contribution-day-component-0-0" data-date="2026-01-01"></td>` +
    `<tool-tip for="contribution-day-component-0-0">3 contributions on January 1st.</tool-tip>` +
    `<td id="contribution-day-component-1-0" data-date="2026-01-02"></td>` +
    `<tool-tip for="contribution-day-component-1-0">No contributions on January 2nd.</tool-tip>`;
  const fake = (async (url: string) =>
    String(url).includes("graphql")
      ? jsonResponse({ errors: [{ message: "bad credentials" }] })
      : new Response(html, { status: 200 })) as unknown as typeof fetch;

  const warnings: string[] = [];
  const { weeks, source } = await fetchGrid({
    user: "octo",
    token: "bad",
    fetchImpl: fake,
    warn: (m) => warnings.push(m),
  });
  assert.match(source, /fallback/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /GraphQL failed/);
  // the HTML ids are {row}-{col}: "0-0" is col 0 / row 0 and "1-0" is col 0 / row 1
  assert.equal(weeks[0][0], 3);
  assert.equal(weeks[0][1], 0);
  assert.equal(weeks[0][2], null); // cells missing from the page stay walls
});

test("HTML parser throws when the markup has no cells (GitHub changed its page)", () => {
  assert.throws(() => parseContributionsHtml("<html></html>"), /no cells/);
});

test("without a token only the public page is used", async () => {
  const calls: string[] = [];
  const html = `<td id="contribution-day-component-0-0" data-date="x"></td><tool-tip for="contribution-day-component-0-0">1 contribution on a day.</tool-tip>`;
  const fake = (async (url: string) => {
    calls.push(String(url));
    return new Response(html, { status: 200 });
  }) as unknown as typeof fetch;
  await fetchGrid({ user: "octo", fetchImpl: fake });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /github\.com\/users\/octo\/contributions/);
});
