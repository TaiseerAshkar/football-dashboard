"use server";

import { fetchExtraLegs, ODDS_SPORTS, type ExtraMarket, type ExtraRequest } from "@/lib/odds";

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
