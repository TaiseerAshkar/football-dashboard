import Link from "next/link";
import { Suspense } from "react";
import { FormBadges } from "@/app/components/FormBadges";
import { getMatches, getScorers, type Scorer } from "@/lib/football";
import { lastFive } from "@/lib/form";
import { getStandings } from "@/lib/standings";

async function Standings() {
  const [standings, matches] = await Promise.all([getStandings(), getMatches()]);
  if (!standings.ok) {
    return <p className="text-red-600">Could not load standings: {standings.error}</p>;
  }

  return (
    <table className="w-full text-left text-sm [&_td]:px-2 [&_th]:px-2">
      <thead>
        <tr className="border-b">
          <th className="py-2">#</th>
          <th>Team</th>
          <th>P</th>
          <th>W</th>
          <th>D</th>
          <th>L</th>
          <th>GD</th>
          <th>Pts</th>
          <th>Form</th>
        </tr>
      </thead>
      <tbody>
        {standings.table.map((row) => (
          <tr key={row.team.id} className="border-b">
            <td className="py-2">{row.position}</td>
            <td>
              <Link href={`/team/${row.team.id}`} className="font-medium hover:underline">
                {row.team.name}
              </Link>
            </td>
            <td>{row.playedGames}</td>
            <td>{row.won}</td>
            <td>{row.draw}</td>
            <td>{row.lost}</td>
            <td>{row.goalDifference}</td>
            <td className="font-semibold">{row.points}</td>
            <td>
              {/* If the matches request failed, the form column is just empty. */}
              {matches.ok && <FormBadges games={lastFive(matches.data, row.team.id)} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TopFive({
  title,
  players,
  stat,
}: {
  title: string;
  players: Scorer[];
  stat: "goals" | "assists";
}) {
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <ol className="space-y-1 text-sm">
        {players.map((p, i) => (
          <li key={p.name} className="flex justify-between gap-2 border-b py-1">
            <span>
              {i + 1}. {p.name}{" "}
              <Link href={`/team/${p.teamId}`} className="text-zinc-500 hover:underline">
                ({p.teamName})
              </Link>
            </span>
            <span className="font-semibold">{p[stat]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function Leaders() {
  const result = await getScorers();
  if (!result.ok) {
    return <p className="text-red-600">Could not load top players: {result.error}</p>;
  }
  const byGoals = [...result.data].sort((a, b) => b.goals - a.goals).slice(0, 5);
  const byAssists = [...result.data].sort((a, b) => b.assists - a.assists).slice(0, 5);

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <TopFive title="Top scorers" players={byGoals} stat="goals" />
      <TopFive title="Top assisters" players={byAssists} stat="assists" />
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 p-8">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Premier League</h1>
        <Suspense fallback={<p>Loading standings...</p>}>
          <Standings />
        </Suspense>
      </section>
      <section>
        <Suspense fallback={<p>Loading top players...</p>}>
          <Leaders />
        </Suspense>
      </section>
    </main>
  );
}
