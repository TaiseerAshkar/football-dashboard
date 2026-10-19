"use server";

import { settleParlays } from "@/lib/settle";

type Item = { id: string; pick: string; match: string; league: string; date: string };

// Checks saved tips against finished results. The input comes from the browser,
// so it is validated and size-limited.
export async function checkTipResults(items: Item[]) {
  const text = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
  const clean = (Array.isArray(items) ? items : [])
    .slice(0, 30)
    .filter(
      (x) =>
        x &&
        text(x.id, 40) &&
        text(x.pick, 120) &&
        text(x.match, 120) &&
        text(x.league, 60) &&
        !Number.isNaN(new Date(x.date).getTime()),
    )
    .map((x) => ({ id: x.id, picks: [{ pick: x.pick, match: x.match, league: x.league, date: x.date }] }));
  if (clean.length === 0) return [];
  const settled = await settleParlays(clean);
  return settled.map((s) => ({ id: s.id, result: s.legs[0] ?? "unknown" }));
}
