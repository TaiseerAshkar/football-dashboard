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

export type Leg = {
  matchId: string;
  date: string;
  league: string;
  match: string;
  pick: string;
  odds: number; // decimal odds offered by the bookmaker
  prob: number; // chance with the bookmaker's margin removed, 0..1
  source: string;
  approx?: boolean; // derived from the 1X2 prices (double chance), not quoted directly
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
};

function pickMarket(event: RawEvent, marketKey: string, ok: (outcomes: RawOutcome[]) => boolean) {
  const books = [...event.bookmakers].sort((a, b) => rank(a.key) - rank(b.key));
  for (const b of books) {
    const m = b.markets.find((x) => x.key === marketKey && ok(x.outcomes));
    if (m) return { outcomes: m.outcomes, source: NAMES[b.key] ?? b.title };
  }
  return null;
}

// DC odds are not quoted in the cheap API call, so they're derived from the 1X2
// prices with a typical bookmaker margin on top. Shown as approximate.
const DC_MARGIN = 0.97;

// Every simple bet (result, double chance, over/under goals) priced by a real
// bookmaker, for matches kicking off in the next `days` days.
export function buildOddsLegs(events: RawEvent[], league: string, now: number, days: number): Leg[] {
  const until = now + days * 24 * 60 * 60 * 1000;
  const legs: Leg[] = [];

  for (const e of events) {
    const t = new Date(e.commence_time).getTime();
    if (t <= now || t > until) continue;
    const match = `${e.home_team} vs ${e.away_team}`;
    const base = { matchId: e.id, date: e.commence_time, league, match };

    const h2h = pickMarket(e, "h2h", (o) => o.length === 3);
    if (h2h) {
      const price = (name: string) => h2h.outcomes.find((o) => o.name === name)?.price;
      const oh = price(e.home_team);
      const oa = price(e.away_team);
      const od = price("Draw");
      if (oh && oa && od) {
        const total = 1 / oh + 1 / od + 1 / oa;
        const ph = 1 / oh / total;
        const pd = 1 / od / total;
        const pa = 1 / oa / total;
        const src = h2h.source;
        legs.push(
          { ...base, pick: `${e.home_team} to win`, odds: oh, prob: ph, source: src },
          { ...base, pick: "Draw", odds: od, prob: pd, source: src },
          { ...base, pick: `${e.away_team} to win`, odds: oa, prob: pa, source: src },
          { ...base, pick: `${e.home_team} or draw`, odds: DC_MARGIN / (ph + pd), prob: ph + pd, source: src, approx: true },
          { ...base, pick: `${e.away_team} or draw`, odds: DC_MARGIN / (pa + pd), prob: pa + pd, source: src, approx: true },
        );
      }
    }

    // Over/under goals, only .5 lines (no half-win Asian lines).
    const totals = pickMarket(e, "totals", (o) => o.some((x) => x.point !== undefined && x.point % 1 === 0.5));
    if (totals) {
      const points = [...new Set(totals.outcomes.map((o) => o.point).filter((p): p is number => p !== undefined && p % 1 === 0.5))];
      for (const point of points) {
        const over = totals.outcomes.find((o) => o.point === point && o.name === "Over");
        const under = totals.outcomes.find((o) => o.point === point && o.name === "Under");
        if (!over || !under) continue;
        const total = 1 / over.price + 1 / under.price;
        legs.push(
          { ...base, pick: `Over ${point} goals`, odds: over.price, prob: 1 / over.price / total, source: totals.source },
          { ...base, pick: `Under ${point} goals`, odds: under.price, prob: 1 / under.price / total, source: totals.source },
        );
      }
    }
  }

  // skip near-certain legs (odds ~1.0), which make parlays pointless
  return legs.filter((l) => l.odds >= 1.08);
}
