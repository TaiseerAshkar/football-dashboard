import { getMatches, type Match } from "@/lib/football";
import { LEAGUES } from "@/lib/leagues";
import type { LegResult } from "@/lib/saved";
import { bestMatch } from "@/lib/teamNames";

export type CheckPick = { pick: string; match: string; league: string; date: string };
export type CheckParlay = { id: string; picks: CheckPick[] };

const WINDOW_MS = 36 * 60 * 60 * 1000; // the odds data and results can differ by a few hours

// Did this bet win, given the final score? Player bets can't be checked.
function evaluate(pick: string, home: string, away: string, h: number, a: number): LegResult {
  const yes = (ok: boolean): LegResult => (ok ? "won" : "lost");
  if (pick === `${home} to win`) return yes(h > a);
  if (pick === `${away} to win`) return yes(a > h);
  if (pick === "Draw") return yes(h === a);
  if (pick === `${home} or draw`) return yes(h >= a);
  if (pick === `${away} or draw`) return yes(a >= h);
  if (pick === "Either team wins (no draw)") return yes(h !== a);
  if (pick === "Both teams to score") return yes(h > 0 && a > 0);
  if (pick === "Both teams not to score") return yes(!(h > 0 && a > 0));
  const line = pick.match(/^(Over|Under) ([0-9.]+) goals$/);
  if (line) return yes(line[1] === "Over" ? h + a > Number(line[2]) : h + a < Number(line[2]));
  return "unknown";
}

// Looks up every leg in the finished results (football-data.org, cached) and
// says whether it won, lost, or the match hasn't finished yet.
export async function settleParlays(parlays: CheckParlay[]): Promise<{ id: string; legs: LegResult[] }[]> {
  const leagueNames = [...new Set(parlays.flatMap((p) => p.picks.map((x) => x.league)))];
  const lists = new Map<string, Match[]>();
  await Promise.all(
    leagueNames.map(async (name) => {
      const lg = LEAGUES.find((l) => l.name === name);
      if (!lg) return; // Belgium, Saudi: no results source
      const r = await getMatches(lg.code);
      if (r.ok) lists.set(name, r.data);
    }),
  );

  const teamsByLeague = new Map<string, { id: number; names: string[] }[]>();
  for (const [name, matches] of lists) {
    const teams = new Map<number, { id: number; names: string[] }>();
    for (const m of matches) {
      for (const t of [m.home, m.away]) {
        if (t.id && !teams.has(t.id)) teams.set(t.id, { id: t.id, names: [...new Set([t.name, t.full ?? t.name])] });
      }
    }
    teamsByLeague.set(name, [...teams.values()]);
  }

  return parlays.map((parlay) => ({
    id: parlay.id,
    legs: parlay.picks.map((p): LegResult => {
      const matches = lists.get(p.league);
      const teams = teamsByLeague.get(p.league);
      if (!matches || !teams || p.pick.endsWith("to score anytime")) return "unknown";

      const parts = p.match.split(" vs ");
      if (parts.length !== 2) return "unknown";
      const homeId = bestMatch(teams, parts[0])?.id;
      const awayId = bestMatch(teams, parts[1])?.id;
      if (!homeId || !awayId) return "unknown";

      const when = new Date(p.date).getTime();
      const found = matches.find(
        (m) => m.home.id === homeId && m.away.id === awayId && Math.abs(new Date(m.date).getTime() - when) <= WINDOW_MS,
      );
      if (!found) return "unknown";
      if (!found.finished) return "pending";
      return evaluate(p.pick, parts[0], parts[1], found.homeGoals, found.awayGoals);
    }),
  }));
}
