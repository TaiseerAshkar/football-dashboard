import type { Match } from "@/lib/football";
import type { Leg } from "@/lib/odds";

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

// ---- matching team names between the odds provider and football-data.org ----

const STOP = new Set(["fc", "cf", "afc", "sc", "ac", "as", "ssc", "rc", "ud", "cd", "sv", "vfb", "vfl", "fk", "sk", "de", "the", "club", "calcio", "us"]);

const tokens = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));

const sameToken = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

// [share of the shorter name that matched, share of the longer name that matched].
// The second number breaks ties, e.g. "Inter Milan" matches both "Inter" and
// "AC Milan" on one word each, but only "Inter" matches both its words.
function similarity(a: string[], b: string[]): [number, number] {
  if (a.length === 0 || b.length === 0) return [0, 0];
  const matched = a.filter((x) => b.some((y) => sameToken(x, y))).length;
  return [matched / Math.min(a.length, b.length), matched / Math.max(a.length, b.length)];
}

function findTeam(index: TeamForm[], name: string): TeamForm | undefined {
  const want = tokens(name);
  let best: TeamForm | undefined;
  let bestScore: [number, number] = [0, 0];
  let tie = false;
  for (const t of index) {
    let score: [number, number] = [0, 0];
    for (const n of t.names) {
      const s = similarity(want, tokens(n));
      if (s[0] > score[0] || (s[0] === score[0] && s[1] > score[1])) score = s;
    }
    const better = score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1]);
    if (better) {
      best = t;
      bestScore = score;
      tie = false;
    } else if (score[0] === bestScore[0] && score[1] === bestScore[1] && score[0] > 0) {
      tie = true;
    }
  }
  return bestScore[0] >= 0.5 && !tie ? best : undefined;
}

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
    if (m && enough(h) && enough(a)) {
      const line = Number(m[2]);
      const over = m[1] === "Over";
      const hit = (t: TeamForm) => count(t, (g) => (over ? g.gf + g.ga > line : g.gf + g.ga < line));
      why = `${m[1]} ${line} goals happened in ${hit(h)} of ${leg.home}'s last 5 and ${hit(a)} of ${leg.away}'s.`;
      const avg = (goalsFor(h) + goalsAgainst(h) + goalsFor(a) + goalsAgainst(a)) / 10;
      why += ` Their games average ${avg.toFixed(1)} goals.`;
    }
  } else if (leg.kind === "btts" && enough(h) && enough(a)) {
    const both = (t: TeamForm) => count(t, (g) => g.gf > 0 && g.ga > 0);
    const yes = leg.pick === "Both teams to score";
    why = yes
      ? `Both teams scored in ${both(h)} of ${leg.home}'s last 5 and ${both(a)} of ${leg.away}'s.`
      : `Both teams scored in only ${both(h)} of ${leg.home}'s last 5 and ${both(a)} of ${leg.away}'s.`;
  }

  return why ? `${why} ${market}` : `No recent results to compare. ${market}`;
}
