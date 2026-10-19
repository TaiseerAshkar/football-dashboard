import type { Match } from "@/lib/football";
import type { Leg } from "@/lib/odds";
import { bestMatch } from "@/lib/teamNames";

// A team's recent results (newest first), pulled from football-data.org. The
// same team id appears in its league and in European games, so one list covers
// all competitions we have.
export type TeamForm = {
  names: string[]; // short and full club name, both used for matching
  games: { home: boolean; gf: number; ga: number }[];
};

const KEEP = 10;

export function buildFormIndex(matchLists: Match[][]): TeamForm[] {
  const teams = new Map<number, { names: string[]; games: { date: string; home: boolean; gf: number; ga: number }[] }>();
  for (const m of matchLists.flat()) {
    if (!m.finished || !m.home.id || !m.away.id) continue;
    for (const home of [true, false]) {
      const t = home ? m.home : m.away;
      const entry = teams.get(t.id) ?? { names: [...new Set([t.name, t.full ?? t.name])], games: [] };
      entry.games.push({
        date: m.date,
        home,
        gf: home ? m.homeGoals : m.awayGoals,
        ga: home ? m.awayGoals : m.homeGoals,
      });
      teams.set(t.id, entry);
    }
  }
  return [...teams.values()].map((t) => ({
    names: t.names,
    games: t.games
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, KEEP)
      .map(({ home, gf, ga }) => ({ home, gf, ga })),
  }));
}

const findTeam = (index: TeamForm[], name: string): TeamForm | undefined => bestMatch(index, name);

// ---- the reason text ----

const last = (t: TeamForm, n = 5) => t.games.slice(0, n);
const count = (t: TeamForm, f: (g: TeamForm["games"][number]) => boolean, n = 5) => last(t, n).filter(f).length;
const wins = (t: TeamForm) => count(t, (g) => g.gf > g.ga);
const draws = (t: TeamForm) => count(t, (g) => g.gf === g.ga);
const losses = (t: TeamForm) => count(t, (g) => g.gf < g.ga);
const goalsFor = (t: TeamForm) => last(t).reduce((s, g) => s + g.gf, 0);
const goalsAgainst = (t: TeamForm) => last(t).reduce((s, g) => s + g.ga, 0);

const enough = (t?: TeamForm): t is TeamForm => !!t && t.games.length >= 3;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Recent record at one venue (home games for the home side, away games for the visitor).
function venueText(t: TeamForm, atHome: boolean) {
  const games = t.games.filter((g) => g.home === atHome).slice(0, 5);
  if (games.length < 3) return "";
  const w = games.filter((g) => g.gf > g.ga).length;
  const d = games.filter((g) => g.gf === g.ga).length;
  const l = games.length - w - d;
  return ` ${atHome ? "At home" : "Away"} they are ${w}W ${d}D ${l}L in their last ${games.length}.`;
}

export function explain(leg: Leg, index: TeamForm[]): string {
  const market = `${leg.source} prices it at ${leg.odds.toFixed(2)}, about ${(leg.prob * 100).toFixed(0)}% likely.`;
  if (leg.kind === "player") return `A goal-scorer prop, priced by US bookmakers. ${market}`;

  const h = findTeam(index, leg.home);
  const a = findTeam(index, leg.away);
  let why = "";

  if (leg.kind === "result" || leg.kind === "dc") {
    const pick = leg.pick;
    const homeSide = pick === `${leg.home} to win` || pick === `${leg.home} or draw`;
    const awaySide = pick === `${leg.away} to win` || pick === `${leg.away} or draw`;
    const side = homeSide ? h : awaySide ? a : undefined;
    const other = homeSide ? a : awaySide ? h : undefined;
    const sideName = homeSide ? leg.home : leg.away;
    const otherName = homeSide ? leg.away : leg.home;

    if (pick.endsWith("to win") && enough(side)) {
      why = `${sideName} won ${wins(side)} of their last 5 (${goalsFor(side)} scored, ${goalsAgainst(side)} conceded).`;
      why += venueText(side, homeSide);
      if (enough(other)) why += ` ${otherName} lost ${losses(other)} of theirs.`;
    } else if (pick.endsWith("or draw") && enough(side)) {
      why = `${sideName} avoided defeat in ${5 - losses(side)} of their last 5.`;
      why += venueText(side, homeSide);
      if (enough(other)) why += ` ${otherName} won ${wins(other)} of theirs.`;
    } else if (pick === "Draw" && enough(h) && enough(a)) {
      why = `${draws(h)} of ${leg.home}'s and ${draws(a)} of ${leg.away}'s last 5 games ended level.`;
    } else if (pick.startsWith("Either team") && enough(h) && enough(a)) {
      why = `Only ${plural(draws(h), "draw")} for ${leg.home} and ${draws(a)} for ${leg.away} in their last 5, so a winner is likely.`;
    }
  } else if (leg.kind === "goals" || leg.kind === "lines") {
    const m = leg.pick.match(/^(Over|Under) ([0-9.]+) goals$/);
    const have = [
      { team: h, name: leg.home },
      { team: a, name: leg.away },
    ].filter((x): x is { team: TeamForm; name: string } => enough(x.team));
    if (m && have.length > 0) {
      const line = Number(m[2]);
      const over = m[1] === "Over";
      const hit = (t: TeamForm) => count(t, (g) => (over ? g.gf + g.ga > line : g.gf + g.ga < line));
      const parts = have.map((x) => `${hit(x.team)} of ${x.name}'s last 5`);
      why = `${m[1]} ${line} goals happened in ${parts.join(" and ")}.`;
      const avg = have.reduce((s, x) => s + goalsFor(x.team) + goalsAgainst(x.team), 0) / (have.length * 5);
      why += ` ${have.length === 1 ? `${have[0].name}'s games` : "Their games"} average ${avg.toFixed(1)} goals.`;
    }
  } else if (leg.kind === "btts") {
    const have = [
      { team: h, name: leg.home },
      { team: a, name: leg.away },
    ].filter((x): x is { team: TeamForm; name: string } => enough(x.team));
    if (have.length > 0) {
      const both = (t: TeamForm) => count(t, (g) => g.gf > 0 && g.ga > 0);
      const parts = have.map((x) => `${both(x.team)} of ${x.name}'s last 5`);
      why =
        leg.pick === "Both teams to score"
          ? `Both teams scored in ${parts.join(" and ")}.`
          : `Both teams scored in only ${parts.join(" and ")}.`;
    }
  }

  return why ? `${why} ${market}` : `No recent results to compare. ${market}`;
}
