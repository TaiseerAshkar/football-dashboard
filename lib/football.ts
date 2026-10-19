import { cacheLife } from "next/cache";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const FIVE_MIN = { stale: 300, revalidate: 300, expire: 3600 };
// Scorer lists change slowly, so cache them longer to save API requests.
const THIRTY_MIN = { stale: 1800, revalidate: 1800, expire: 7200 };
const RETRY_SOON = { stale: 0, revalidate: 10, expire: 60 };

// Server-only fetch to football-data.org. Never throws: returns a Result.
export async function apiGet(path: string): Promise<Result<any>> {
  const key = process.env.FOOTBALL_API_KEY;
  if (!key) return { ok: false, status: 500, error: "API key is not configured" };

  let res: Response;
  try {
    res = await fetch(`https://api.football-data.org/v4${path}`, {
      headers: { "X-Auth-Token": key },
    });
  } catch {
    return { ok: false, status: 502, error: "Football data service is unreachable" };
  }
  if (res.status === 429) {
    return { ok: false, status: 429, error: "Rate limit reached, try again in a minute" };
  }
  if (!res.ok) {
    return { ok: false, status: 502, error: "Football data service returned an error" };
  }
  return { ok: true, data: await res.json() };
}

export type Match = {
  date: string;
  finished: boolean;
  home: { id: number; name: string };
  away: { id: number; name: string };
  homeGoals: number;
  awayGoals: number;
};

// Every match of the season (finished and upcoming) in ONE request per league.
// Form, stats, predictions and fixtures are all computed from this, so we stay
// far under the free 10 requests/minute limit.
export async function getMatches(league: string): Promise<Result<Match[]>> {
  "use cache";
  cacheLife(FIVE_MIN);

  const r = await apiGet(`/competitions/${league}/matches`);
  if (!r.ok) {
    cacheLife(RETRY_SOON);
    return r;
  }
  const matches: Match[] = r.data.matches.map((m: any) => ({
    date: m.utcDate,
    finished: m.status === "FINISHED",
    home: { id: m.homeTeam.id, name: m.homeTeam.shortName ?? m.homeTeam.name },
    away: { id: m.awayTeam.id, name: m.awayTeam.shortName ?? m.awayTeam.name },
    homeGoals: m.score.fullTime.home ?? 0,
    awayGoals: m.score.fullTime.away ?? 0,
  }));
  return { ok: true, data: matches };
}

export type Scorer = {
  name: string;
  teamId: number;
  teamName: string;
  goals: number;
  assists: number;
};

// Top 50 scorers. Assist leaders are taken from this list too, so a player
// with assists but very few goals could be missing (free-tier simplification).
export async function getScorers(league: string): Promise<Result<Scorer[]>> {
  "use cache";
  cacheLife(THIRTY_MIN);

  const r = await apiGet(`/competitions/${league}/scorers?limit=50`);
  if (!r.ok) {
    cacheLife(RETRY_SOON);
    return r;
  }
  const scorers: Scorer[] = r.data.scorers.map((s: any) => ({
    name: s.player.name,
    teamId: s.team.id,
    teamName: s.team.shortName ?? s.team.name,
    goals: s.goals ?? 0,
    assists: s.assists ?? 0,
  }));
  return { ok: true, data: scorers };
}
