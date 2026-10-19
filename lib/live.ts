import type { Match } from "@/lib/football";
import type { StandingRow } from "@/lib/standings";

export type LiveInfo = { opponent: string; gf: number; ga: number; home: boolean };
export type LiveRow = StandingRow & { live?: LiveInfo };

// Rebuilds the table from match results (counting matches in play at their
// current score) whenever a match is live, or whenever the official table is
// behind the match list (a game just finished). Otherwise the official
// football-data.org table is used as is. Ties are broken by points, goal
// difference, goals scored, then the official order, so a few league-specific
// tie-break rules (like head-to-head) can differ until the official table updates.
export function withLive(rows: StandingRow[], matches: Match[]): { rows: LiveRow[]; anyLive: boolean } {
  const anyLive = matches.some((m) => m.live);
  const counted = matches.filter(
    (m) => (m.finished || m.live) && (m.stage === "REGULAR_SEASON" || m.stage === "LEAGUE_STAGE"),
  );

  const stats = new Map<number, { played: number; won: number; draw: number; lost: number; gf: number; ga: number }>();
  const live = new Map<number, LiveInfo>();
  for (const r of rows) stats.set(r.team.id, { played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0 });

  for (const m of counted) {
    for (const home of [true, false]) {
      const id = home ? m.home.id : m.away.id;
      const st = stats.get(id);
      if (!st) continue;
      const gf = home ? m.homeGoals : m.awayGoals;
      const ga = home ? m.awayGoals : m.homeGoals;
      st.played++;
      st.gf += gf;
      st.ga += ga;
      if (gf > ga) st.won++;
      else if (gf === ga) st.draw++;
      else st.lost++;
      if (m.live) live.set(id, { opponent: home ? m.away.name : m.home.name, gf, ga, home });
    }
  }

  const behind = rows.some((r) => (stats.get(r.team.id)?.played ?? 0) > r.playedGames);
  if (!anyLive && !behind) return { rows, anyLive: false };

  const rebuilt = rows.map((r) => {
    const st = stats.get(r.team.id)!;
    return {
      ...r,
      playedGames: st.played,
      won: st.won,
      draw: st.draw,
      lost: st.lost,
      goalsFor: st.gf,
      goalsAgainst: st.ga,
      goalDifference: st.gf - st.ga,
      points: st.won * 3 + st.draw,
      live: live.get(r.team.id),
    };
  });
  rebuilt.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.position - b.position,
  );
  rebuilt.forEach((r, i) => (r.position = i + 1));
  return { rows: rebuilt, anyLive };
}
