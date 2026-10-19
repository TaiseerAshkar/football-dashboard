import { leaguePredictor } from "@/lib/analysis";
import type { Match } from "@/lib/football";

export type Tip = {
  matchId: number;
  leagueName: string;
  home: string;
  away: string;
  date: string;
  pick: string;
  prob: number; // % chance from the goals model
  why: string;
};

export type TipResult =
  | { kind: "tips"; tips: Tip[] }
  // every match today has started or finished (or there were none): wait for tomorrow
  | { kind: "wait"; nextDay: string | null; hadGames: boolean };

const dayKey = (iso: string) => iso.slice(0, 10); // UTC day, like the kick-off times on the site
const MAX_PROB = 95; // no model deserves to promise more than this

// The most likely thing that can happen in the matches still to be played today
// (UTC day), across every competition. Best pick per match, then the top three
// matches. When nothing is left to play today it says to wait for tomorrow.
export function tipOfTheDay(lists: { leagueName: string; matches: Match[] }[], now: number): TipResult {
  const today = dayKey(new Date(now).toISOString());
  const tips: Tip[] = [];
  let hadGames = false;
  let nextDay: string | null = null;

  for (const { leagueName, matches } of lists) {
    let predict: ReturnType<typeof leaguePredictor> | null = null;
    for (const m of matches) {
      if (!m.home.id || !m.away.id) continue;
      const day = dayKey(m.date);
      if (day === today) hadGames = true;
      if (m.finished || m.live) continue;
      if (day > today && (nextDay === null || day < nextDay)) nextDay = day;
      if (day !== today || new Date(m.date).getTime() <= now) continue;

      predict ??= leaguePredictor(matches);
      const p = predict(m.home.id, m.away.id);
      const goals = `Model goals: ${m.home.name} ${p.lambdaHome.toFixed(1)}, ${m.away.name} ${p.lambdaAway.toFixed(1)}.`;
      const options: [string, number][] = [
        [`${m.home.name} to win`, p.homeWin],
        [`${m.away.name} to win`, p.awayWin],
        [`${m.home.name} or draw`, p.homeOrDraw],
        [`${m.away.name} or draw`, p.awayOrDraw],
        ["Over 1.5 goals", p.over15],
        ["Over 2.5 goals", p.over25],
        ["Under 2.5 goals", p.under25],
        ["Both teams to score", p.btts],
        ["Both teams not to score", p.noBtts],
      ];
      const [pick, prob] = options.reduce((a, b) => (b[1] > a[1] ? b : a));
      tips.push({
        matchId: m.id,
        leagueName,
        home: m.home.name,
        away: m.away.name,
        date: m.date,
        pick,
        prob: Math.min(prob, MAX_PROB),
        why: goals,
      });
    }
  }

  if (tips.length === 0) return { kind: "wait", nextDay, hadGames };
  tips.sort((a, b) => b.prob - a.prob);
  return { kind: "tips", tips: tips.slice(0, 3) };
}
