import type { Match } from "@/lib/football";
import type { StandingRow } from "@/lib/standings";

export type Story = {
  id: string;
  tone: "good" | "bad" | "info";
  icon: string;
  title: string;
  detail: string;
  teamId?: number;
  weight: number; // how interesting it is, used to pick and order the stories
};

type Game = { home: boolean; gf: number; ga: number; opponent: string };

// How many of the newest games in a row satisfy `test`.
const run = (games: Game[], test: (g: Game) => boolean) => {
  let n = 0;
  for (const g of games) {
    if (!test(g)) break;
    n++;
  }
  return n;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Short headlines written automatically from the results: streaks, droughts,
// home and away form, records, and the title race.
export function buildStories(matches: Match[], table: StandingRow[]): Story[] {
  const finished = matches.filter((m) => m.finished && m.home.id && m.away.id);
  const names = new Map<number, string>();
  for (const r of table) names.set(r.team.id, r.team.shortName ?? r.team.name);

  // each team's games, newest first
  const byTeam = new Map<number, Game[]>();
  for (const m of [...finished].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const home of [true, false]) {
      const t = home ? m.home : m.away;
      const o = home ? m.away : m.home;
      const list = byTeam.get(t.id) ?? [];
      list.push({ home, gf: home ? m.homeGoals : m.awayGoals, ga: home ? m.awayGoals : m.homeGoals, opponent: o.name });
      byTeam.set(t.id, list);
    }
  }

  const out: Story[] = [];
  const add = (s: Omit<Story, "id">) => out.push({ ...s, id: `${s.teamId ?? "x"}-${s.title}` });

  for (const [teamId, games] of byTeam) {
    const name = names.get(teamId);
    if (!name || games.length < 3) continue;
    const last = games[0];
    const lastText = `Last: ${last.gf}-${last.ga} ${last.home ? "vs" : "at"} ${last.opponent}`;

    const wins = run(games, (g) => g.gf > g.ga);
    const unbeaten = run(games, (g) => g.gf >= g.ga);
    const winless = run(games, (g) => g.gf <= g.ga);
    const losing = run(games, (g) => g.gf < g.ga);
    const blanks = run(games, (g) => g.gf === 0);
    const sheets = run(games, (g) => g.ga === 0);
    const scoring = run(games, (g) => g.gf > 0);
    const homeGames = games.filter((g) => g.home);
    const awayGames = games.filter((g) => !g.home);
    const homeUnbeaten = run(homeGames, (g) => g.gf >= g.ga);
    const awayUnbeaten = run(awayGames, (g) => g.gf >= g.ga);
    const awayWinless = run(awayGames, (g) => g.gf <= g.ga);
    const homeWinless = run(homeGames, (g) => g.gf <= g.ga);

    if (wins >= 3) add({ tone: "good", icon: "🔥", title: `${name} have won ${wins} in a row`, detail: lastText, teamId, weight: wins * 3 });
    if (unbeaten >= 5 && unbeaten > wins) {
      add({ tone: "good", icon: "🛡️", title: `${name} are unbeaten in ${unbeaten}`, detail: lastText, teamId, weight: unbeaten * 2 });
    }
    if (winless >= 4) add({ tone: "bad", icon: "🥶", title: `${name} haven't won in ${winless}`, detail: lastText, teamId, weight: winless * 2.2 });
    if (losing >= 3) add({ tone: "bad", icon: "📉", title: `${name} have lost ${losing} in a row`, detail: lastText, teamId, weight: losing * 3 });
    if (blanks >= 2) add({ tone: "bad", icon: "🚫", title: `${name} haven't scored in ${blanks}`, detail: lastText, teamId, weight: blanks * 3.2 });
    if (sheets >= 2) add({ tone: "good", icon: "🧤", title: `${name} have ${plural(sheets, "clean sheet")} in a row`, detail: lastText, teamId, weight: sheets * 3 });
    if (scoring >= 8) add({ tone: "good", icon: "⚽", title: `${name} have scored in ${scoring} straight`, detail: lastText, teamId, weight: scoring });
    if (homeUnbeaten >= 5) {
      add({ tone: "good", icon: "🏟️", title: `${name} are unbeaten at home in ${homeUnbeaten}`, detail: "Home games only", teamId, weight: homeUnbeaten * 1.6 });
    }
    if (awayUnbeaten >= 4) {
      add({ tone: "good", icon: "✈️", title: `${name} are unbeaten away in ${awayUnbeaten}`, detail: "Away games only", teamId, weight: awayUnbeaten * 2 });
    }
    if (awayWinless >= 5) {
      add({ tone: "bad", icon: "🧳", title: `${name} haven't won away in ${awayWinless}`, detail: "Away games only", teamId, weight: awayWinless * 1.6 });
    }
    if (homeWinless >= 4) {
      add({ tone: "bad", icon: "🏚️", title: `${name} haven't won at home in ${homeWinless}`, detail: "Home games only", teamId, weight: homeWinless * 2 });
    }
  }

  // best attack and best defence (teams with enough games)
  const rates = [...byTeam.entries()]
    .filter(([id, g]) => names.has(id) && g.length >= 5)
    .map(([id, g]) => ({
      id,
      name: names.get(id)!,
      gf: g.reduce((s, x) => s + x.gf, 0) / g.length,
      ga: g.reduce((s, x) => s + x.ga, 0) / g.length,
    }));
  if (rates.length > 0) {
    const attack = rates.reduce((a, b) => (b.gf > a.gf ? b : a));
    const defence = rates.reduce((a, b) => (b.ga < a.ga ? b : a));
    add({ tone: "info", icon: "🎯", title: `Best attack: ${attack.name}`, detail: `${attack.gf.toFixed(1)} goals per game`, teamId: attack.id, weight: 9 });
    add({ tone: "info", icon: "🔒", title: `Best defence: ${defence.name}`, detail: `Only ${defence.ga.toFixed(1)} conceded per game`, teamId: defence.id, weight: 9 });
  }

  // the title race
  if (table.length >= 2 && table[0].playedGames > 0) {
    const gap = table[0].points - table[1].points;
    const lead = table[0].team.shortName ?? table[0].team.name;
    const chaser = table[1].team.shortName ?? table[1].team.name;
    if (gap >= 3) {
      add({ tone: "good", icon: "👑", title: `${lead} are ${plural(gap, "point")} clear`, detail: `${chaser} are second`, teamId: table[0].team.id, weight: 10 + gap });
    } else {
      add({
        tone: "info",
        icon: "🏁",
        title: gap === 0 ? `${lead} and ${chaser} are level at the top` : `${lead} lead ${chaser} by ${plural(gap, "point")}`,
        detail: "A tight title race",
        teamId: table[0].team.id,
        weight: 11,
      });
    }
  }

  // records of the season so far
  if (finished.length > 0) {
    const diff = (m: Match) => Math.abs(m.homeGoals - m.awayGoals);
    const goals = (m: Match) => m.homeGoals + m.awayGoals;
    const biggest = finished.reduce((a, b) => (diff(b) > diff(a) ? b : a));
    if (diff(biggest) >= 3) {
      add({ tone: "info", icon: "💥", title: `Biggest win: ${biggest.home.name} ${biggest.homeGoals}-${biggest.awayGoals} ${biggest.away.name}`, detail: "So far this season", weight: 7 });
    }
    const wildest = finished.reduce((a, b) => (goals(b) > goals(a) ? b : a));
    if (goals(wildest) >= 6 && wildest !== biggest) {
      add({ tone: "info", icon: "🎢", title: `Goal fest: ${wildest.home.name} ${wildest.homeGoals}-${wildest.awayGoals} ${wildest.away.name}`, detail: `${goals(wildest)} goals in one game`, weight: 6 });
    }
  }

  // best first, never more than two stories about the same team
  const perTeam = new Map<number, number>();
  const picked: Story[] = [];
  for (const s of out.sort((a, b) => b.weight - a.weight)) {
    const used = s.teamId ? (perTeam.get(s.teamId) ?? 0) : 0;
    if (s.teamId && used >= 2) continue;
    if (s.teamId) perTeam.set(s.teamId, used + 1);
    picked.push(s);
    if (picked.length === 8) break;
  }
  return picked;
}

// Quick numbers about the whole league so far, for the hero card.
export function leagueStats(matches: Match[]) {
  const done = matches.filter((m) => m.finished);
  const n = done.length;
  if (n === 0) return null;
  const goals = done.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0);
  return {
    played: n,
    goalsPerGame: goals / n,
    homeWins: Math.round((done.filter((m) => m.homeGoals > m.awayGoals).length / n) * 100),
    over25: Math.round((done.filter((m) => m.homeGoals + m.awayGoals >= 3).length / n) * 100),
  };
}
