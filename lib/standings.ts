import { cachedGet } from "@/lib/football";

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

// Cached for 5 minutes (shared across server instances). Failures are
// returned, not thrown, so callers can show a message.
export async function getStandings(league: string): Promise<StandingsResult> {
  const r = await cachedGet(`/competitions/${league}/standings`, 300);
  if (!r.ok) return r;

  // "TOTAL" is the full-season table (the API also returns HOME and AWAY).
  const total = r.data.standings?.find(
    (s: { type: string }) => s.type === "TOTAL",
  );
  if (!total)
    return {
      ok: false,
      status: 502,
      error: "Unexpected response from football data service",
    };
  return { ok: true, table: total.table };
}
