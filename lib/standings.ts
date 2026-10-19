import { cacheLife } from "next/cache";
import { apiGet } from "@/lib/football";

export type StandingRow = {
  position: number;
  team: { id: number; name: string; shortName: string; crest: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type StandingsResult =
  | { ok: true; table: StandingRow[] }
  | { ok: false; status: number; error: string };

// Cached for 5 minutes. Failures are returned (not thrown) so callers can show
// a message, and they get a very short cache life so they're retried quickly.
export async function getStandings(league: string): Promise<StandingsResult> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });

  const fail = (status: number, error: string): StandingsResult => {
    cacheLife({ stale: 0, revalidate: 10, expire: 60 });
    return { ok: false, status, error };
  };

  const r = await apiGet(`/competitions/${league}/standings`);
  if (!r.ok) return fail(r.status, r.error);

  // "TOTAL" is the full-season table (the API also returns HOME and AWAY).
  const total = r.data.standings?.find((s: { type: string }) => s.type === "TOTAL");
  if (!total) return fail(502, "Unexpected response from football data service");
  return { ok: true, table: total.table };
}
