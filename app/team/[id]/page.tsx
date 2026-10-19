import Link from "next/link";
import { Suspense } from "react";
import { FormBadges } from "@/app/components/FormBadges";
import { getMatches } from "@/lib/football";
import { lastFive, prosAndCons } from "@/lib/form";
import { getStandings } from "@/lib/standings";

async function TeamDetails({ params }: { params: Promise<{ id: string }> }) {
  const teamId = Number((await params).id);
  const [standings, matches] = await Promise.all([getStandings(), getMatches()]);

  if (!standings.ok) return <p className="text-red-600">Could not load team: {standings.error}</p>;
  if (!matches.ok) return <p className="text-red-600">Could not load matches: {matches.error}</p>;

  const row = standings.table.find((r) => r.team.id === teamId);
  if (!row) return <p>Team not found.</p>;

  const games = lastFive(matches.data, teamId);
  const { pros, cons } = prosAndCons(games);

  return (
    <>
      <h1 className="text-2xl font-semibold">{row.team.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Position {row.position} · {row.points} pts · {row.won}W {row.draw}D {row.lost}L ·
        goals {row.goalsFor}:{row.goalsAgainst}
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">
        Last {games.length} matches <FormBadges games={games} />
      </h2>
      <ul className="space-y-1 text-sm">
        {games.map((g) => (
          <li key={g.date} className="flex justify-between border-b py-1">
            <span>
              {g.home ? "vs" : "@"} {g.opponent}
            </span>
            <span className="font-semibold">
              {g.gf}-{g.ga} ({g.result})
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-green-600">Pros</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {pros.length ? pros.map((p) => <li key={p}>{p}</li>) : <li>Nothing stands out</li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold text-red-600">Cons</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {cons.length ? cons.map((c) => <li key={c}>{c}</li>) : <li>Nothing stands out</li>}
          </ul>
        </div>
      </div>
    </>
  );
}

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/" className="mb-4 inline-block text-sm hover:underline">
        ← Back to table
      </Link>
      <Suspense fallback={<p>Loading team...</p>}>
        <TeamDetails params={params} />
      </Suspense>
    </main>
  );
}
