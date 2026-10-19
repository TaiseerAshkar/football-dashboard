import type { Match } from "@/lib/football";

export type Game = {
  date: string;
  opponent: string;
  home: boolean;
  gf: number;
  ga: number;
  result: "W" | "D" | "L";
};

// A team's last 5 finished games, newest first.
export function lastFive(matches: Match[], teamId: number): Game[] {
  return matches
    .filter((m) => m.home.id === teamId || m.away.id === teamId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((m) => {
      const home = m.home.id === teamId;
      const gf = home ? m.homeGoals : m.awayGoals;
      const ga = home ? m.awayGoals : m.homeGoals;
      return {
        date: m.date,
        opponent: home ? m.away.name : m.home.name,
        home,
        gf,
        ga,
        result: gf > ga ? "W" : gf < ga ? "L" : "D",
      };
    });
}

// Simple rule-based pros and cons from those games (not AI, just the numbers).
export function prosAndCons(games: Game[]) {
  const pros: string[] = [];
  const cons: string[] = [];
  const n = games.length;
  if (n === 0) return { pros, cons };

  const wins = games.filter((g) => g.result === "W").length;
  const losses = games.filter((g) => g.result === "L").length;
  const scored = games.reduce((sum, g) => sum + g.gf, 0);
  const conceded = games.reduce((sum, g) => sum + g.ga, 0);
  const cleanSheets = games.filter((g) => g.ga === 0).length;
  const blanks = games.filter((g) => g.gf === 0).length;

  if (wins >= 3) pros.push(`Won ${wins} of the last ${n}`);
  if (losses === 0) pros.push(`Unbeaten in the last ${n}`);
  if (scored / n >= 2) pros.push(`Scoring freely: ${scored} goals in ${n} games`);
  if (cleanSheets >= 2) pros.push(`${cleanSheets} clean sheets in the last ${n}`);
  if (blanks === 0) pros.push(`Scored in every one of the last ${n}`);

  if (losses >= 2) cons.push(`Lost ${losses} of the last ${n}`);
  if (wins === 0) cons.push(`No wins in the last ${n}`);
  if (conceded / n >= 1.5) cons.push(`Leaking goals: ${conceded} conceded in ${n} games`);
  if (blanks >= 2) cons.push(`Failed to score in ${blanks} of the last ${n}`);
  if (cleanSheets === 0) cons.push(`No clean sheets in the last ${n}`);

  return { pros, cons };
}
