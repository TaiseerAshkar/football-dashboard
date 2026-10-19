"use server";

import { fetchExtraLegs, ODDS_SPORTS, type ExtraMarket, type ExtraRequest } from "@/lib/odds";
import { settleParlays, type CheckParlay } from "@/lib/settle";

const MARKETS: readonly ExtraMarket[] = ["btts", "double_chance", "alternate_totals", "player"];

// Called from the parlay page when the user chooses bet types that need extra
// odds. The input comes from the browser, so it is validated strictly.
export async function loadExtraOdds(requests: ExtraRequest[]) {
  const clean = (Array.isArray(requests) ? requests : [])
    .filter(
      (r) =>
        r &&
        typeof r.id === "string" &&
        /^[a-f0-9]{32}$/.test(r.id) &&
        ODDS_SPORTS.some((s) => s.key === r.sport) &&
        MARKETS.includes(r.market),
    )
    .slice(0, 60); // never more than 60 credits in one go
  if (clean.length === 0) return { legs: [], done: [], remaining: null };
  return fetchExtraLegs(clean);
}

// Checks saved parlays against finished results. The input comes from the
// browser, so it is validated and size-limited.
export async function checkSavedParlays(parlays: CheckParlay[]) {
  const text = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
  const clean = (Array.isArray(parlays) ? parlays : [])
    .slice(0, 25)
    .filter((p) => p && text(p.id, 80) && Array.isArray(p.picks) && p.picks.length > 0 && p.picks.length <= 30)
    .map((p) => ({
      id: p.id,
      picks: p.picks.map((x) => ({
        pick: text(x?.pick, 120) ? x.pick : "",
        match: text(x?.match, 120) ? x.match : "",
        league: text(x?.league, 60) ? x.league : "",
        date: !Number.isNaN(new Date(x?.date).getTime()) ? x.date : "1970-01-01T00:00:00Z",
      })),
    }));
  if (clean.length === 0) return [];
  return settleParlays(clean);
}
