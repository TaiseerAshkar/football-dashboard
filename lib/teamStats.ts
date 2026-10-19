import type { Match } from "@/lib/football";

export type TeamGame = {
  date: string;
  home: boolean;
  opponent: string;
  gf: number;
  ga: number;
  result: "W" | "D" | "L";
};

export type Split = {
  played: number;
  won: number;
  draw: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
};

export type TeamPage = {
  games: TeamGame[]; // finished games, newest first
  upcoming: { date: string; home: boolean; opponent: string }[];
  total: Split;
  home: Split;
  away: Split;
  cleanSheets: number; // % of games
  failedToScore: number;
  over25: number;
  btts: number;
};

const empty = (): Split => ({ played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, points: 0 });

function add(split: Split, g: TeamGame) {
  split.played++;
  split.gf += g.gf;
  split.ga += g.ga;
  if (g.result === "W") {
    split.won++;
    split.points += 3;
  } else if (g.result === "D") {
    split.draw++;
    split.points += 1;
  } else {
    split.lost++;
  }
}

// Everything the team page shows, worked out from one league's match list.
export function buildTeamPage(matches: Match[], teamId: number): TeamPage {
  const mine = matches.filter((m) => m.home.id === teamId || m.away.id === teamId);

  const games: TeamGame[] = mine
    .filter((m) => m.finished)
    .map((m): TeamGame => {
      const home = m.home.id === teamId;
      const gf = home ? m.homeGoals : m.awayGoals;
      const ga = home ? m.awayGoals : m.homeGoals;
      return {
        date: m.date,
        home,
        opponent: home ? m.away.name : m.home.name,
        gf,
        ga,
        result: gf > ga ? "W" : gf < ga ? "L" : "D",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const upcoming = mine
    .filter((m) => !m.finished && !m.live)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
    .map((m) => {
      const home = m.home.id === teamId;
      return { date: m.date, home, opponent: home ? m.away.name : m.home.name };
    });

  const total = empty();
  const home = empty();
  const away = empty();
  for (const g of games) {
    add(total, g);
    add(g.home ? home : away, g);
  }

  const share = (f: (g: TeamGame) => boolean) =>
    games.length ? Math.round((games.filter(f).length / games.length) * 100) : 0;

  return {
    games,
    upcoming,
    total,
    home,
    away,
    cleanSheets: share((g) => g.ga === 0),
    failedToScore: share((g) => g.gf === 0),
    over25: share((g) => g.gf + g.ga >= 3),
    btts: share((g) => g.gf > 0 && g.ga > 0),
  };
}
