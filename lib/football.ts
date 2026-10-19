import { unstable_cache } from "next/cache";
import { connection } from "next/server";

export type Result<T> =
  { ok: true; data: T } | { ok: false; status: number; error: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Server-only fetch to football-data.org. Never throws: returns a Result.
// If the free plan's per-minute limit is hit and it resets within a few
// seconds, wait and retry once. Otherwise fail fast (the page retries by itself).
export async function apiGet(path: string): Promise<Result<any>> {
  const key = process.env.FOOTBALL_API_KEY;
  if (!key) return { ok: false, status: 500, error: "API key is not configured" };

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://api.football-data.org/v4${path}`, {
        headers: { "X-Auth-Token": key },
      });
    } catch {
      return { ok: false, status: 502, error: "Football data service is unreachable" };
    }

    if (res.status === 429) {
      const reset = Number(res.headers.get("x-requestcounter-reset"));
      if (attempt === 0 && reset > 0 && reset <= 8) {
        await sleep((reset + 1) * 1000);
        continue;
      }
      return { ok: false, status: 429, error: "Rate limit reached, retrying shortly" };
    }
    if (!res.ok) {
      return { ok: false, status: 502, error: "Football data service returned an error" };
    }
    return { ok: true, data: await res.json() };
  }
  return { ok: false, status: 429, error: "Rate limit reached, retrying shortly" };
}

// apiGet, but cached in Next's shared data cache (it persists across all
// serverless instances, unlike "use cache", so visitors don't each hit the API).
// Failures are thrown inside the cache function so they are never cached.
export async function cachedGet(
  path: string,
  revalidateSeconds: number,
): Promise<Result<any>> {
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
      return {
        ok: false,
        status: 502,
        error: "Football data service returned an error",
      };
    }
  }
}

export type Match = {
  id: number;
  stage: string;
  live: boolean;
  date: string;
  finished: boolean;
  home: { id: number; name: string; full?: string };
  away: { id: number; name: string; full?: string };
  homeGoals: number;
  awayGoals: number;
};

const toMatches = (raw: any[]): Match[] =>
  raw.map((m) => ({
    id: m.id,
    stage: m.stage ?? "",
    live: ["IN_PLAY", "PAUSED", "LIVE"].includes(m.status),
    date: m.utcDate,
    finished: m.status === "FINISHED",
    home: { id: m.homeTeam.id, name: m.homeTeam.shortName ?? m.homeTeam.name, full: m.homeTeam.name },
    away: { id: m.awayTeam.id, name: m.awayTeam.shortName ?? m.awayTeam.name, full: m.awayTeam.name },
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

const HOUR = 60 * 60 * 1000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

// Matches from yesterday to tomorrow, cached for only 60 seconds. This is what
// gives live scores (and just-finished results) without waiting 5 minutes.
async function getFreshMatches(league: string): Promise<Result<Match[]>> {
  const now = Date.now();
  const r = await cachedGet(
    `/competitions/${league}/matches?dateFrom=${day(now - 24 * HOUR)}&dateTo=${day(now + 24 * HOUR)}`,
    60,
  );
  if (!r.ok) return r;
  return { ok: true, data: toMatches(r.data.matches) };
}

// getMatches(), plus fresh data for any match that could be in play right now.
// The extra (60s-cached) request only happens while a match is inside its
// kick-off window, so quiet times cost no extra API requests.
export async function getLiveAwareMatches(league: string): Promise<Result<Match[]>> {
  await connection(); // we need the real current time, so run at request time
  const base = await getMatches(league);
  if (!base.ok) return base;

  const now = Date.now();
  const maybeLive = base.data.some((m) => {
    const t = new Date(m.date).getTime();
    return !m.finished && t <= now && t > now - 3.5 * HOUR;
  });
  if (!maybeLive) return base;

  const fresh = await getFreshMatches(league);
  if (!fresh.ok) return base; // fall back to the 5-minute data
  const byId = new Map(fresh.data.map((m) => [m.id, m]));
  return { ok: true, data: base.data.map((m) => byId.get(m.id) ?? m) };
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
  // Scorer lists change slowly, so cache them for an hour.
  const r = await cachedGet(`/competitions/${league}/scorers?limit=50`, 3600);
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
