import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ParlayBuilder } from "@/app/components/ParlayBuilder";
import { RetryNotice } from "@/app/components/RetryNotice";
import { ThemeToggle } from "@/app/components/ThemeToggle";
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
    <>
      {failed.length > 0 && (
        <RetryNotice message={`Could not load ${failed.join(", ")}`} />
      )}
      <ParlayBuilder legs={legs} />
    </>
  );
}

export default function ParlayPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="text-sm hover:underline">
          ← Back to tables
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-semibold">Parlay builder</h1>
      <Suspense fallback={<p>Loading matches...</p>}>
        <Builder />
      </Suspense>
    </main>
  );
}
