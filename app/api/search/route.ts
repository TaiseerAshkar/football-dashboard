import { connection } from "next/server";
import { getMatches } from "@/lib/football";
import { LEAGUES } from "@/lib/leagues";
import type { NextMatch, SearchTeam } from "@/lib/searchTypes";

type Acc = {
  id: number;
  name: string;
  full: string;
  league: string;
  leagueName: string;
  games: { date: string; result: "W" | "D" | "L" }[];
  fixtures: (NextMatch & { ts: number })[];
};

// One small list of every team we know, with its recent form and its next 3
// matches across ALL competitions (league and Champions League together).
// It is built from the same cached match lists the tables use, and the browser
// and CDN may keep it for a few minutes.
export async function GET() {
  await connection(); // needs the real current time, so run at request time
  const now = Date.now();
  const lists = await Promise.all(LEAGUES.map(async (league) => ({ league, result: await getMatches(league.code) })));
  const failed = lists.filter((x) => !x.result.ok).map((x) => x.league.name);

  const teams = new Map<number, Acc>();
  for (const { league, result } of lists) {
    if (!result.ok) continue;
    for (const m of result.data) {
      if (!m.home.id || !m.away.id) continue; // fixtures whose teams aren't decided yet
      for (const home of [true, false]) {
        const t = home ? m.home : m.away;
        const o = home ? m.away : m.home;
        let acc = teams.get(t.id);
        if (!acc) {
          acc = { id: t.id, name: t.name, full: t.full ?? t.name, league: league.code, leagueName: league.name, games: [], fixtures: [] };
          teams.set(t.id, acc);
        }
        // a team's home league wins over the Champions League
        if (acc.league === "CL" && league.code !== "CL") {
          acc.league = league.code;
          acc.leagueName = league.name;
        }
        if (m.finished) {
          const gf = home ? m.homeGoals : m.awayGoals;
          const ga = home ? m.awayGoals : m.homeGoals;
          acc.games.push({ date: m.date, result: gf > ga ? "W" : gf < ga ? "L" : "D" });
        } else if (!m.live) {
          const ts = new Date(m.date).getTime();
          if (ts > now - 2 * 60 * 60 * 1000) {
            acc.fixtures.push({ date: m.date, home, opponent: o.name, competition: league.name, ts });
          }
        }
      }
    }
  }

  const out: SearchTeam[] = [...teams.values()]
    .map((t) => ({
      id: t.id,
      name: t.name,
      full: t.full,
      league: t.league,
      leagueName: t.leagueName,
      form: t.games
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
        .map((g) => g.result),
      next: t.fixtures
        .sort((a, b) => a.ts - b.ts)
        .slice(0, 3)
        .map(({ ts: _ts, ...rest }) => rest),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json(
    { teams: out, failed },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
