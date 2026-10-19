import { unstable_cache } from "next/cache";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };


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

// apiGet, but cached in Next's shared data cache (it persists across all
// serverless instances, unlike "use cache", so visitors don't each hit the API).
// Failures are thrown inside the cache function so they are never cached.
export async function cachedGet(path: string, revalidateSeconds: number): Promise<Result<any>> {
  const run = unstable_cache(
    async () => {
      const r = await apiGet(path);
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.data;
    },
    ["football-data", path],
    { revalidate: revalidateSeconds },
  );
  try {
    return { ok: true, data: await run() };
  } catch (e) {
    try {
      return JSON.parse((e as Error).message);
    } catch {
      return { ok: false, status: 502, error: "Football data service returned an error" };
    }
  }
}

export type Match = {
  id: number;
  date: string;
  finished: boolean;
  home: { id: number; name: string };
  away: { id: number; name: string };
  homeGoals: number;
  awayGoals: number;
};

const toMatches = (raw: any[]): Match[] =>
  raw.map((m) => ({
    id: m.id,
    date: m.utcDate,
    finished: m.status === "FINISHED",
    home: { id: m.homeTeam.id, name: m.homeTeam.shortName ?? m.homeTeam.name },
    away: { id: m.awayTeam.id, name: m.awayTeam.shortName ?? m.awayTeam.name },
    homeGoals: m.score.fullTime.home ?? 0,
    awayGoals: m.score.fullTime.away ?? 0,
  }));

// Every match of the season (finished and upcoming) in ONE request per league.
// Form, stats, predictions and fixtures are all computed from this, so we stay
// far under the free 10 requests/minute limit.
export async function getMatches(league: string): Promise<Result<Match[]>> {
  const r = await cachedGet(`/competitions/${league}/matches`, 300);
  if (!r.ok) return r;
  return { ok: true, data: toMatches(r.data.matches) };
}

// Past meetings of the two teams in a fixture, as far back as the API has them
// (about 2020 on the free plan). Old results never change, so cache for a day.
export async function getHeadToHead(matchId: number): Promise<Result<Match[]>> {
  const r = await cachedGet(`/matches/${matchId}/head2head?limit=50`, 86400);
  if (!r.ok) return r;
  const finished = r.data.matches.filter((m: any) => m.status === "FINISHED");
  return { ok: true, data: toMatches(finished) };
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
  // Scorer lists change slowly, so cache them for 30 minutes.
  const r = await cachedGet(`/competitions/${league}/scorers?limit=50`, 1800);
  if (!r.ok) return r;
  const scorers: Scorer[] = r.data.scorers.map((s: any) => ({
    name: s.player.name,
    teamId: s.team.id,
    teamName: s.team.shortName ?? s.team.name,
    goals: s.goals ?? 0,
    assists: s.assists ?? 0,
  }));
  return { ok: true, data: scorers };
}
