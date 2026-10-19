import { unstable_cache } from "next/cache";
import type { Result } from "@/lib/football";

// Real bookmaker odds from The Odds API (the-odds-api.com). Stake itself isn't
// covered, so we use Betsson, whose prices track Stake's closely.
//
// Free plan = 500 credits/month. One call per competition with two markets costs
// 2 credits, and the cache below only refreshes each competition every 30 hours:
// 9 competitions x 2 credits x ~24 refreshes a month = ~430 credits.
export const ODDS_SPORTS = [
  { key: "soccer_epl", league: "Premier League" },
  { key: "soccer_spain_la_liga", league: "La Liga" },
  { key: "soccer_germany_bundesliga", league: "Bundesliga" },
  { key: "soccer_italy_serie_a", league: "Serie A" },
  { key: "soccer_france_ligue_one", league: "Ligue 1" },
  { key: "soccer_portugal_primeira_liga", league: "Primeira Liga" },
  { key: "soccer_uefa_champs_league", league: "Champions League" },
  { key: "soccer_belgium_first_div", league: "Belgian Pro League" },
  { key: "soccer_saudi_arabia_pro_league", league: "Saudi Pro League" },
] as const;

const REFRESH_SECONDS = 30 * 60 * 60;

type RawOutcome = { name: string; price: number; point?: number };
type RawEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: { key: string; outcomes: RawOutcome[] }[];
  }[];
};

export type OddsEvents = { events: RawEvent[]; remaining: number | null; fetchedAt: string };

async function fetchOdds(sport: string): Promise<OddsEvents> {
  const key = process.env.ODDS_API_KEY;
  const fail = (status: number, error: string): never => {
    throw new Error(JSON.stringify({ ok: false, status, error }));
  };
  if (!key) return fail(500, "Odds API key is not configured");

  let res: Response;
  try {
    res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${key}&regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`,
    );
  } catch {
    return fail(502, "Odds service is unreachable");
  }
  if (res.status === 401) return fail(401, "Odds credits for this month are used up, or the key is invalid");
  if (res.status === 429) return fail(429, "Odds service is busy, try again shortly");
  if (!res.ok) return fail(502, "Odds service returned an error");

  const remaining = Number(res.headers.get("x-requests-remaining"));
  return {
    events: await res.json(),
    remaining: Number.isFinite(remaining) ? remaining : null,
    fetchedAt: new Date().toISOString(),
  };
}

// Cached in Next's shared data cache. Failures are thrown inside the cache
// function so they are never cached (and cost no credits when refused).
export async function getOdds(sport: string): Promise<Result<OddsEvents>> {
  const run = unstable_cache(() => fetchOdds(sport), ["odds-v1", sport], {
    revalidate: REFRESH_SECONDS,
  });
  try {
    return { ok: true, data: await run() };
  } catch (e) {
    try {
      return JSON.parse((e as Error).message);
    } catch {
      return { ok: false, status: 502, error: "Odds service returned an error" };
    }
  }
}

export type LegKind = "result" | "goals" | "dc" | "btts" | "lines" | "player";

export type Leg = {
  matchId: string;
  sport: string;
  date: string;
  league: string;
  match: string;
  home: string;
  away: string;
  pick: string;
  odds: number; // decimal odds offered by the bookmaker
  prob: number; // chance with the bookmaker's margin removed, 0..1
  source: string;
  kind: LegKind;
  note?: string;
};

// Bookmakers in the order we prefer them (Betsson matches Stake's prices best).
const PREFERRED = ["betsson", "nordicbet", "unibet_se", "williamhill", "marathonbet", "unibet_nl", "coolbet", "sport888", "betclic_fr", "onexbet"];
const rank = (k: string) => {
  const i = PREFERRED.indexOf(k);
  return i === -1 ? 99 : i;
};
const NAMES: Record<string, string> = {
  betsson: "Betsson",
  nordicbet: "NordicBet",
  unibet_se: "Unibet",
  unibet_nl: "Unibet",
  williamhill: "William Hill",
  marathonbet: "Marathonbet",
  coolbet: "Coolbet",
  sport888: "888sport",
  betclic_fr: "Betclic",
  onexbet: "1xBet",
  matchbook: "Matchbook",
  codere_it: "Codere",
};

type Books = RawEvent["bookmakers"];

function findMarket(bookmakers: Books, marketKey: string, ok: (outcomes: RawOutcome[]) => boolean) {
  const books = [...bookmakers].sort((a, b) => rank(a.key) - rank(b.key));
  for (const b of books) {
    const m = b.markets.find((x) => x.key === marketKey && ok(x.outcomes));
    if (m) return { outcomes: m.outcomes, source: NAMES[b.key] ?? b.title };
  }
  return null;
}

const halfLine = (p: number | undefined): p is number => p !== undefined && p % 1 === 0.5;

// Over/under pairs at every .5 line of a totals-type market (no half-win Asian lines).
function overUnderLegs(
  base: Pick<Leg, "matchId" | "sport" | "date" | "league" | "match" | "home" | "away">,
  market: { outcomes: RawOutcome[]; source: string },
  kind: LegKind,
): Leg[] {
  const legs: Leg[] = [];
  const points = [...new Set(market.outcomes.map((o) => o.point).filter(halfLine))];
  for (const point of points) {
    const over = market.outcomes.find((o) => o.point === point && o.name === "Over");
    const under = market.outcomes.find((o) => o.point === point && o.name === "Under");
    if (!over || !under) continue;
    const total = 1 / over.price + 1 / under.price;
    legs.push(
      { ...base, kind, pick: `Over ${point} goals`, odds: over.price, prob: 1 / over.price / total, source: market.source },
      { ...base, kind, pick: `Under ${point} goals`, odds: under.price, prob: 1 / under.price / total, source: market.source },
    );
  }
  return legs;
}

// Match result and main over/under line, from the cheap competition-wide call.
export function buildOddsLegs(events: RawEvent[], league: string, now: number, days: number, sport: string): Leg[] {
  const until = now + days * 24 * 60 * 60 * 1000;
  const legs: Leg[] = [];

  for (const e of events) {
    const t = new Date(e.commence_time).getTime();
    if (t <= now || t > until) continue;
    const base = {
      matchId: e.id,
      sport,
      date: e.commence_time,
      league,
      match: `${e.home_team} vs ${e.away_team}`,
      home: e.home_team,
      away: e.away_team,
    };

    const h2h = findMarket(e.bookmakers, "h2h", (o) => o.length === 3);
    if (h2h) {
      const price = (name: string) => h2h.outcomes.find((o) => o.name === name)?.price;
      const oh = price(e.home_team);
      const oa = price(e.away_team);
      const od = price("Draw");
      if (oh && oa && od) {
        const total = 1 / oh + 1 / od + 1 / oa;
        legs.push(
          { ...base, kind: "result", pick: `${e.home_team} to win`, odds: oh, prob: 1 / oh / total, source: h2h.source },
          { ...base, kind: "result", pick: "Draw", odds: od, prob: 1 / od / total, source: h2h.source },
          { ...base, kind: "result", pick: `${e.away_team} to win`, odds: oa, prob: 1 / oa / total, source: h2h.source },
        );
      }
    }

    const totals = findMarket(e.bookmakers, "totals", (o) => o.some((x) => halfLine(x.point)));
    if (totals) legs.push(...overUnderLegs(base, totals, "goals"));
  }

  // skip near-certain legs (odds ~1.0), which make parlays pointless
  return legs.filter((l) => l.odds >= 1.08);
}

// ---------------------------------------------------------------------------
// Extra markets (both teams to score, double chance, more goal lines, player to
// score). These cost 1 credit per match per market, so they are fetched only
// when the user asks, one match and one market at a time, and cached for a day.
// ---------------------------------------------------------------------------

export type ExtraMarket = "btts" | "double_chance" | "alternate_totals" | "player";

// Player prices only exist for these competitions, and only from US bookmakers.
export const PLAYER_SPORTS: readonly string[] = [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
];

type EventDetail = { bookmakers: Books };

async function fetchEventMarket(sport: string, id: string, market: string, region: string): Promise<{ detail: EventDetail; remaining: number | null }> {
  const key = process.env.ODDS_API_KEY;
  const fail = (status: number, error: string): never => {
    throw new Error(JSON.stringify({ ok: false, status, error }));
  };
  if (!key) return fail(500, "Odds API key is not configured");

  let res: Response;
  try {
    res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/events/${id}/odds?apiKey=${key}&regions=${region}&markets=${market}&oddsFormat=decimal&dateFormat=iso`,
    );
  } catch {
    return fail(502, "Odds service is unreachable");
  }
  if (res.status === 401) return fail(401, "Odds credits for this month are used up");
  if (res.status === 404) return { detail: { bookmakers: [] }, remaining: null };
  if (!res.ok) return fail(502, "Odds service returned an error");

  const remaining = Number(res.headers.get("x-requests-remaining"));
  const body = await res.json();
  return { detail: { bookmakers: body.bookmakers ?? [] }, remaining: Number.isFinite(remaining) ? remaining : null };
}

// Cached for a day per match and market, so repeating a build costs nothing.
async function getEventMarket(sport: string, id: string, market: string, region: string) {
  const run = unstable_cache(() => fetchEventMarket(sport, id, market, region), ["odds-ev-v1", sport, id, market, region], {
    revalidate: 24 * 60 * 60,
  });
  return run();
}

function legsFromDetail(event: RawEvent, sport: string, league: string, market: ExtraMarket, detail: EventDetail): Leg[] {
  const home = event.home_team;
  const away = event.away_team;
  const base = { matchId: event.id, sport, date: event.commence_time, league, match: `${home} vs ${away}`, home, away };
  const legs: Leg[] = [];

  if (market === "btts") {
    const m = findMarket(detail.bookmakers, "btts", (o) => o.length === 2);
    const yes = m?.outcomes.find((o) => o.name === "Yes");
    const no = m?.outcomes.find((o) => o.name === "No");
    if (m && yes && no) {
      const total = 1 / yes.price + 1 / no.price;
      legs.push(
        { ...base, kind: "btts", pick: "Both teams to score", odds: yes.price, prob: 1 / yes.price / total, source: m.source },
        { ...base, kind: "btts", pick: "Both teams not to score", odds: no.price, prob: 1 / no.price / total, source: m.source },
      );
    }
  }

  if (market === "double_chance") {
    const m = findMarket(detail.bookmakers, "double_chance", (o) => o.length === 3);
    if (m) {
      const names: [string, string][] = [
        [`${home} or Draw`, `${home} or draw`],
        [`${away} or Draw`, `${away} or draw`],
        [`${home} or ${away}`, "Either team wins (no draw)"],
      ];
      const found = names.flatMap(([quoted, label]) => {
        const o = m.outcomes.find((x) => x.name === quoted);
        return o ? [{ label, price: o.price }] : [];
      });
      // each match result sits inside two of the three bets, so the fair chances add up to 2;
      // normalise over ALL three quoted prices (even if a name didn't match) and never exceed 97%
      const sum = m.outcomes.reduce((t, o) => t + 1 / o.price, 0);
      for (const f of found) {
        legs.push({ ...base, kind: "dc", pick: f.label, odds: f.price, prob: Math.min(0.97, ((1 / f.price) / sum) * 2), source: m.source });
      }
    }
  }

  if (market === "alternate_totals") {
    const m = findMarket(detail.bookmakers, "alternate_totals", (o) => o.some((x) => halfLine(x.point)));
    if (m) legs.push(...overUnderLegs(base, m, "lines"));
  }

  if (market === "player") {
    // choose the bookmaker that lists the most players
    const books = [...detail.bookmakers].sort(
      (a, b) =>
        (b.markets.find((x) => x.key === "player_goal_scorer_anytime")?.outcomes.length ?? 0) -
        (a.markets.find((x) => x.key === "player_goal_scorer_anytime")?.outcomes.length ?? 0),
    );
    const m = books[0]?.markets.find((x) => x.key === "player_goal_scorer_anytime");
    for (const o of m?.outcomes ?? []) {
      const player = (o as RawOutcome & { description?: string }).description;
      if (o.name !== "Yes" || !player || o.price < 1.3 || o.price > 10) continue;
      legs.push({
        ...base,
        kind: "player",
        pick: `${player} to score anytime`,
        odds: o.price,
        // one-sided market, so take off a rough 15% for the margin
        prob: Math.min(0.9, (1 / o.price) * 0.85),
        source: "US bookmaker",
        note: "US odds, rough",
      });
    }
  }

  return legs;
}

// Stop spending on extras when the monthly credits drop below this, so the
// everyday competition odds (about 18 credits a day) never run dry.
export const CREDIT_RESERVE = 250;

export type ExtraRequest = { sport: string; id: string; market: ExtraMarket };

export async function fetchExtraLegs(requests: ExtraRequest[]): Promise<{
  legs: Leg[];
  done: ExtraRequest[];
  remaining: number | null;
  blocked?: string;
}> {
  // Free call: how many credits are left right now?
  const key = process.env.ODDS_API_KEY;
  let remaining: number | null = null;
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${key}`, { cache: "no-store" });
    const n = Number(res.headers.get("x-requests-remaining"));
    remaining = Number.isFinite(n) ? n : null;
  } catch {}
  if (remaining !== null && remaining <= CREDIT_RESERVE) {
    return { legs: [], done: [], remaining, blocked: `Extra odds are paused to protect the credits the main odds need (${remaining} left).` };
  }
  const allowed = remaining === null ? 0 : remaining - CREDIT_RESERVE;
  const todo = requests.slice(0, Math.max(0, allowed));

  // look each match up in the cached competition odds (free), never trust the client
  const cache = new Map<string, RawEvent[]>();
  const eventsFor = async (sport: string) => {
    if (!cache.has(sport)) {
      const r = await getOdds(sport);
      cache.set(sport, r.ok ? r.data.events : []);
    }
    return cache.get(sport)!;
  };

  const legs: Leg[] = [];
  const done: ExtraRequest[] = [];
  let last = remaining;
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (r) => {
        const sportInfo = ODDS_SPORTS.find((s) => s.key === r.sport);
        const event = (await eventsFor(r.sport)).find((e) => e.id === r.id);
        if (!sportInfo || !event) return;
        if (r.market === "player" && !PLAYER_SPORTS.includes(r.sport)) return;
        try {
          const apiMarket = r.market === "player" ? "player_goal_scorer_anytime" : r.market;
          const { detail, remaining: left } = await getEventMarket(r.sport, r.id, apiMarket, r.market === "player" ? "us" : "eu");
          if (left !== null) last = last === null ? left : Math.min(last, left);
          legs.push(...legsFromDetail(event, r.sport, sportInfo.league, r.market, detail));
          done.push(r);
        } catch {
          // leave it out of `done` so it can be tried again later
        }
      }),
    );
  }
  return { legs, done, remaining: last };
}
