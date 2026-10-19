import { connection } from "next/server";
import { Suspense } from "react";
import { ParlayBuilder } from "@/app/components/ParlayBuilder";
import { ListSkeleton } from "@/app/components/Skeletons";
import { buildFormIndex } from "@/lib/explain";
import { getMatches } from "@/lib/football";
import { LEAGUES } from "@/lib/leagues";
import { buildOddsLegs, getOdds, ODDS_SPORTS } from "@/lib/odds";

export const metadata = { title: "Parlay builder" };

// Gathers real bookmaker odds for the upcoming matches of every competition
// (each competition is cached for 30 hours to stay inside the free credit limit).
async function Builder() {
  await connection(); // needs the real current time
  const now = Date.now();
  const [results, formLists] = await Promise.all([
    Promise.all(ODDS_SPORTS.map(async (s) => ({ sport: s, result: await getOdds(s.key) }))),
    // recent results (football-data.org, cached 5 min) used for the "why it could hit" lines;
    // if a league fails to load, its teams just get a shorter explanation
    Promise.all(LEAGUES.map((l) => getMatches(l.code))),
  ]);
  const formIndex = buildFormIndex(formLists.flatMap((r) => (r.ok ? [r.data] : [])));
  const legs = results.flatMap(({ sport, result }) =>
    result.ok ? buildOddsLegs(result.data.events, sport.league, now, 14, sport.key) : [],
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
        formIndex={formIndex}
        meta={{
          remaining: remaining !== null && Number.isFinite(remaining) ? remaining : null,
          updated,
          fetchedAt: oldest,
        }}
      />
    </div>
  );
}

export default function ParlayPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <section className="fade-up relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-info/10 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-accent">Parlay builder</p>
        <h1 className="relative mt-1.5 text-3xl font-extrabold tracking-tight sm:text-5xl">
          Build a bet slip in <span className="text-gradient">seconds</span>
        </h1>
        <p className="relative mt-3 max-w-2xl text-sm text-muted">
          Choose how many games and the total odds. It builds three different options from this week&apos;s matches
          using real bookmaker prices, safest first, and rates the risk of each.
        </p>
        <div className="relative mt-4 flex flex-wrap gap-2 text-xs font-medium">
          {["Real bookmaker odds", "3 options", "Swap any leg", "Share a link"].map((t) => (
            <span key={t} className="rounded-full bg-background/60 px-3 py-1.5 ring-1 ring-line backdrop-blur">
              {t}
            </span>
          ))}
        </div>
      </section>
      <Suspense fallback={<ListSkeleton />}>
        <Builder />
      </Suspense>
    </main>
  );
}
