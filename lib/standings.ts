import { cacheLife } from "next/cache";

export type StandingRow = {
  position: number;
  team: { id: number; name: string; crest: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalDifference: number;
  points: number;
};

export type StandingsResult =
  | { ok: true; table: StandingRow[] }
  | { ok: false; status: number; error: string };

// Cached for 5 minutes. Failures are returned (not thrown) so callers can show
// a message, and they get a very short cache life so they're retried quickly.
export async function getStandings(): Promise<StandingsResult> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });

  const fail = (status: number, error: string): StandingsResult => {
    cacheLife({ stale: 0, revalidate: 10, expire: 60 });
    return { ok: false, status, error };
  };

  const key = process.env.FOOTBALL_API_KEY;
  if (!key) return fail(500, "API key is not configured");

  let res: Response;
  try {
    res = await fetch("https://api.football-data.org/v4/competitions/PL/standings", {
      headers: { "X-Auth-Token": key },
    });
  } catch {
    return fail(502, "Football data service is unreachable");
  }

  if (res.status === 429) return fail(429, "Rate limit reached, try again in a minute");
  if (!res.ok) return fail(502, "Football data service returned an error");

  const data = await res.json();
  // "TOTAL" is the full-season table (the API also returns HOME and AWAY).
  const total = data.standings?.find((s: { type: string }) => s.type === "TOTAL");
  if (!total) return fail(502, "Unexpected response from football data service");
  return { ok: true, table: total.table };
}
