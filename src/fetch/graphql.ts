import { ROWS } from "../types.ts";

type FetchLike = typeof fetch;

/** What a source gives back: commit counts per day and, when the source knows it, GitHub's own level (0..4). */
export interface RawCalendar {
  counts: (number | null)[][];
  levels?: (number | null)[][];
}

const QUERY = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{contributionCount contributionLevel weekday}}}}}}`;

// GraphQL names the level; the contribution graph itself uses 0..4
const LEVELS: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

/**
 * Reads the contribution calendar through GitHub's GraphQL API.
 * Returns [col][row]; days GitHub does not list (the future part of the last week) stay null.
 * `fetchImpl` is injectable so tests do not need the network.
 */
export async function fromGraphQL(user: string, token: string, fetchImpl: FetchLike = fetch): Promise<RawCalendar> {
  const res = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login: user } }),
  });
  const json = (await res.json()) as {
    data?: {
      user?: {
        contributionsCollection?: {
          contributionCalendar?: {
            weeks?: {
              contributionDays: { contributionCount: number; contributionLevel?: string; weekday: number }[];
            }[];
          };
        };
      };
    };
  };
  const weeks = json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!weeks) throw new Error("GraphQL failed: " + JSON.stringify(json).slice(0, 300));
  const counts: (number | null)[][] = [];
  const levels: (number | null)[][] = [];
  for (const w of weeks) {
    const cCol: (number | null)[] = Array(ROWS).fill(null);
    const lCol: (number | null)[] = Array(ROWS).fill(null);
    for (const d of w.contributionDays) {
      cCol[d.weekday] = d.contributionCount;
      lCol[d.weekday] = d.contributionLevel !== undefined ? (LEVELS[d.contributionLevel] ?? null) : null;
    }
    counts.push(cCol);
    levels.push(lCol);
  }
  return { counts, levels };
}
