import { connection } from "next/server";
import { Suspense } from "react";
import { ParlayBuilder } from "@/app/components/ParlayBuilder";
import { RetryNotice } from "@/app/components/RetryNotice";
import { ListSkeleton } from "@/app/components/Skeletons";
import { buildLegs } from "@/lib/analysis";
import { getMatches } from "@/lib/football";
import { LEAGUES } from "@/lib/leagues";

export const metadata = { title: "Parlay builder" };

// Gathers the upcoming matches of every league (each is cached for 5 minutes,
// shared with the main page) and prices them with the goals model.
async function Builder() {
  await connection(); // needs the real current time
  const now = Date.now();
  const results = await Promise.all(
    LEAGUES.map(async (l) => ({ league: l, result: await getMatches(l.code) })),
  );
  const legs = results.flatMap(({ league, result }) =>
    result.ok ? buildLegs(result.data, league.name, now, 7) : [],
  );
  const failed = results.filter((r) => !r.result.ok).map((r) => r.league.name);

  return (
    <div className="space-y-6">
      {failed.length > 0 && <RetryNotice message={`Could not load ${failed.join(", ")}`} />}
      <ParlayBuilder legs={legs} />
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
          week&apos;s matches across all leagues and rates the risk.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Builder />
      </Suspense>
    </main>
  );
}
