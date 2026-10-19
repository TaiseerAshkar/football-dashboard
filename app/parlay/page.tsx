import { connection } from "next/server";
import { Suspense } from "react";
import { ParlayBuilder } from "@/app/components/ParlayBuilder";
import { ListSkeleton } from "@/app/components/Skeletons";
import { buildOddsLegs, getOdds, ODDS_SPORTS } from "@/lib/odds";

export const metadata = { title: "Parlay builder" };

// Gathers real bookmaker odds for the upcoming matches of every competition
// (each competition is cached for 30 hours to stay inside the free credit limit).
async function Builder() {
  await connection(); // needs the real current time
  const now = Date.now();
  const results = await Promise.all(
    ODDS_SPORTS.map(async (s) => ({ sport: s, result: await getOdds(s.key) })),
  );
  const legs = results.flatMap(({ sport, result }) =>
    result.ok ? buildOddsLegs(result.data.events, sport.league, now, 7) : [],
  );
  const failed = results.flatMap((r) => (r.result.ok ? [] : [{ league: r.sport.league, error: r.result.error }]));

  const loaded = results.flatMap((r) => (r.result.ok ? [r.result.data] : []));
  const remaining = loaded.length
    ? Math.min(...loaded.map((d) => d.remaining ?? Infinity).filter(Number.isFinite))
    : null;
  const oldest = loaded.length ? loaded.map((d) => d.fetchedAt).sort()[0] : null;
  const updated = oldest
    ? new Date(oldest).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC"
    : null;

  return (
    <div className="space-y-6">
      {failed.length > 0 && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          Could not load odds for {failed.map((f) => f.league).join(", ")}: {failed[0].error}.
        </p>
      )}
      <ParlayBuilder
        legs={legs}
        meta={{ remaining: remaining !== null && Number.isFinite(remaining) ? remaining : null, updated }}
      />
    </div>
  );
}

export default function ParlayPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Parlay builder</h1>
        <p className="mt-2 text-sm text-muted">
          Pick how many games and the total odds you want. It builds a combination from this
          week&apos;s matches using real bookmaker odds and rates the risk.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Builder />
      </Suspense>
    </main>
  );
}
