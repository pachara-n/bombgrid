import { ROWS } from "../types.ts";

type FetchLike = typeof fetch;

const QUERY = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{contributionCount weekday}}}}}}`;

/**
 * Reads the contribution calendar through GitHub's GraphQL API.
 * Returns weeks[col][row]; days GitHub does not list (the future part of the last week) stay null.
 * `fetchImpl` is injectable so tests do not need the network.
 */
export async function fromGraphQL(
  user: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<(number | null)[][]> {
  const res = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login: user } }),
  });
  const json = (await res.json()) as {
    data?: {
      user?: {
        contributionsCollection?: {
          contributionCalendar?: { weeks?: { contributionDays: { contributionCount: number; weekday: number }[] }[] };
        };
      };
    };
  };
  const weeks = json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!weeks) throw new Error("GraphQL failed: " + JSON.stringify(json).slice(0, 300));
  return weeks.map((w) => {
    const col: (number | null)[] = Array(ROWS).fill(null);
    for (const d of w.contributionDays) col[d.weekday] = d.contributionCount;
    return col;
  });
}
