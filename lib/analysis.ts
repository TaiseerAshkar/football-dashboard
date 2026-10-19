import type { Match } from "@/lib/football";

export type Game = {
  date: string;
  opponent: string;
  home: boolean;
  gf: number;
  ga: number;
  result: "W" | "D" | "L";
};

export type NextMatch = {
  date: string;
  opponent: string;
  home: boolean;
  win: number; // all probabilities are % from this team's point of view
  draw: number;
  loss: number;
  over25: number;
  btts: number;
  xgFor: number;
  xgAgainst: number;
  likelyScore: string; // this team's goals first
  headline: string[];
  matchId: number;
};

export type TeamInfo = {
  games: Game[]; // last 5, newest first
  stats: {
    played: number;
    goalsFor: number; // per game
    goalsAgainst: number; // per game
    over25: number; // % of games
    btts: number;
    cleanSheets: number;
    failedToScore: number;
  };
  pros: string[];
  cons: string[];
  next: NextMatch | null;
};

const pct = (x: number) => Math.round(x * 100);
const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function poisson(k: number, lambda: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

// Poisson model: expected goals come from each team's attack/defence strength
// (home and away separately), shrunk toward the league average because early
// in a season there are only a few games. It's a simple estimate, not a promise.
function makeStrengths(finished: Match[]) {
  const leagueHome = avg(finished.map((m) => m.homeGoals)) || 1.5;
  const leagueAway = avg(finished.map((m) => m.awayGoals)) || 1.2;
  const K = 4; // "virtual" average games added to every team

  const rate = (goals: number[], base: number) =>
    (goals.reduce((a, b) => a + b, 0) + K * base) / (goals.length + K) / base;

  return (teamId: number) => {
    const home = finished.filter((m) => m.home.id === teamId);
    const away = finished.filter((m) => m.away.id === teamId);
    return {
      attackHome: rate(
        home.map((m) => m.homeGoals),
        leagueHome,
      ),
      defenceHome: rate(
        home.map((m) => m.awayGoals),
        leagueAway,
      ),
      attackAway: rate(
        away.map((m) => m.awayGoals),
        leagueAway,
      ),
      defenceAway: rate(
        away.map((m) => m.homeGoals),
        leagueHome,
      ),
      leagueHome,
      leagueAway,
    };
  };
}

function predict(
  strengths: ReturnType<typeof makeStrengths>,
  homeId: number,
  awayId: number,
) {
  const h = strengths(homeId);
  const a = strengths(awayId);
  const lambdaHome = h.leagueHome * h.attackHome * a.defenceAway;
  const lambdaAway = h.leagueAway * a.attackAway * h.defenceHome;

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let best = 0;
  let bestScore: [number, number] = [1, 1];
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const p = poisson(i, lambdaHome) * poisson(j, lambdaAway);
      if (i > j) homeWin += p;
      else if (i === j) draw += p;
      else awayWin += p;
      if (i + j >= 3) over25 += p;
      if (p > best) {
        best = p;
        bestScore = [i, j];
      }
    }
  }
  const btts = (1 - Math.exp(-lambdaHome)) * (1 - Math.exp(-lambdaAway));
  return {
    lambdaHome,
    lambdaAway,
    homeWin,
    draw,
    awayWin,
    over25,
    btts,
    bestScore,
  };
}

function lastGames(finished: Match[], teamId: number): Game[] {
  return finished
    .filter((m) => m.home.id === teamId || m.away.id === teamId)
    .sort((a, b) => b.date.localeCompare(a.date))
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

// Pros/cons framed as betting angles (result, goals, both teams to score),
// based on the last 5 games plus the model's chance for the next match.
function betAngles(games: Game[], next: NextMatch | null) {
  const pros: string[] = [];
  const cons: string[] = [];
  const n = games.length;
  if (n === 0) return { pros, cons };

  const count = (f: (g: Game) => boolean) => games.filter(f).length;
  const wins = count((g) => g.result === "W");
  const losses = count((g) => g.result === "L");
  const over25 = count((g) => g.gf + g.ga >= 3);
  const under25 = count((g) => g.gf + g.ga <= 2);
  const btts = count((g) => g.gf > 0 && g.ga > 0);
  const cleanSheets = count((g) => g.ga === 0);
  const blanks = count((g) => g.gf === 0);
  const gfAvg = avg(games.map((g) => g.gf));
  const gaAvg = avg(games.map((g) => g.ga));

  if (wins >= 3) pros.push(`Result: won ${wins} of the last ${n}`);
  if (next && next.win >= 55)
    pros.push(`Result: ${next.win}% win chance in the next match`);
  if (over25 >= 3)
    pros.push(`Goals: over 2.5 total goals in ${over25} of the last ${n}`);
  if (gfAvg >= 2)
    pros.push(`Goals: scoring ${gfAvg.toFixed(1)} per game lately`);
  if (btts >= 3)
    pros.push(`Both teams to score: yes in ${btts} of the last ${n}`);
  if (cleanSheets >= 2)
    pros.push(`Defence: ${cleanSheets} clean sheets in the last ${n}`);

  if (losses >= 2) cons.push(`Result: lost ${losses} of the last ${n}`);
  if (wins === 0) cons.push(`Result: no wins in the last ${n}`);
  if (under25 >= 3)
    cons.push(
      `Goals: under 2.5 total goals in ${under25} of the last ${n}, so overs are risky`,
    );
  if (blanks >= 2)
    cons.push(`Goals: failed to score in ${blanks} of the last ${n}`);
  if (gaAvg >= 1.5)
    cons.push(`Defence: conceding ${gaAvg.toFixed(1)} per game lately`);
  if (btts <= 1)
    cons.push(`Both teams to score: only ${btts} of the last ${n}`);
  return { pros, cons };
}

function headline(next: Omit<NextMatch, "headline">, teamName: string) {
  const best = Math.max(next.win, next.draw, next.loss);
  const result =
    best === next.win
      ? `${teamName} to win (${next.win}%)`
      : best === next.draw
        ? `Draw (${next.draw}%)`
        : `${next.opponent} to win (${next.loss}%)`;
  const goals =
    next.over25 >= 55
      ? `Over 2.5 goals likely (${next.over25}%)`
      : next.over25 <= 45
        ? `Under 2.5 goals likely (${100 - next.over25}%)`
        : `Goals line is a toss-up (${next.over25}% over 2.5)`;
  const both =
    next.btts >= 55
      ? `Both teams to score likely (${next.btts}%)`
      : next.btts <= 45
        ? `Both teams to score unlikely (${100 - next.btts}%)`
        : `Both teams to score is a toss-up (${next.btts}%)`;
  return [result, goals, both];
}

// Everything the team panel needs, for every team in the league.
export function buildTeamInfos(
  matches: Match[],
  teams: { id: number; name: string }[],
) {
  const finished = matches.filter((m) => m.finished);
  const upcoming = matches
    .filter((m) => !m.finished && !m.live)
    .sort((a, b) => a.date.localeCompare(b.date));
  const strengths = makeStrengths(finished);

  const infos: Record<number, TeamInfo> = {};
  for (const team of teams) {
    const all = lastGames(finished, team.id);
    const games = all.slice(0, 5);

    const fixture = upcoming.find(
      (m) => m.home.id === team.id || m.away.id === team.id,
    );
    let next: NextMatch | null = null;
    if (fixture) {
      const home = fixture.home.id === team.id;
      const p = predict(strengths, fixture.home.id, fixture.away.id);
      const base = {
        matchId: fixture.id,
        date: fixture.date,
        opponent: home ? fixture.away.name : fixture.home.name,
        home,
        win: pct(home ? p.homeWin : p.awayWin),
        draw: pct(p.draw),
        loss: pct(home ? p.awayWin : p.homeWin),
        over25: pct(p.over25),
        btts: pct(p.btts),
        xgFor: home ? p.lambdaHome : p.lambdaAway,
        xgAgainst: home ? p.lambdaAway : p.lambdaHome,
        likelyScore: home
          ? `${p.bestScore[0]}-${p.bestScore[1]}`
          : `${p.bestScore[1]}-${p.bestScore[0]}`,
      };
      next = { ...base, headline: headline(base, team.name) };
    }

    const n = all.length;
    const share = (f: (g: Game) => boolean) =>
      n ? pct(all.filter(f).length / n) : 0;
    infos[team.id] = {
      games,
      stats: {
        played: n,
        goalsFor: avg(all.map((g) => g.gf)),
        goalsAgainst: avg(all.map((g) => g.ga)),
        over25: share((g) => g.gf + g.ga >= 3),
        btts: share((g) => g.gf > 0 && g.ga > 0),
        cleanSheets: share((g) => g.ga === 0),
        failedToScore: share((g) => g.gf === 0),
      },
      ...betAngles(games, next),
      next,
    };
  }
  return infos;
}

export type Fixture = {
  id: number;
  date: string;
  home: string;
  away: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  btts: number;
  likelyScore: string;
};

// The next round of fixtures: as many upcoming matches as one round holds
// (teams / 2), with the model's estimate for each.
export function buildFixtures(matches: Match[]): Fixture[] {
  const strengths = makeStrengths(matches.filter((m) => m.finished));
  const upcoming = matches
    .filter((m) => !m.finished && !m.live && m.home.id && m.away.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const teams = new Set(matches.flatMap((m) => [m.home.id, m.away.id]).filter(Boolean));
  const perRound = Math.max(1, Math.floor(teams.size / 2));

  return upcoming
    .slice(0, perRound)
    .map((m) => {
      const p = predict(strengths, m.home.id, m.away.id);
      return {
        id: m.id,
        date: m.date,
        home: m.home.name,
        away: m.away.name,
        homeWin: pct(p.homeWin),
        draw: pct(p.draw),
        awayWin: pct(p.awayWin),
        over25: pct(p.over25),
        btts: pct(p.btts),
        likelyScore: `${p.bestScore[0]}-${p.bestScore[1]}`,
      };
    });
}
