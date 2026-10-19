import { Suspense } from "react";
import { getStandings } from "@/lib/standings";

async function Standings() {
  const result = await getStandings();
  if (!result.ok) {
    return (
      <p className="text-red-600">Could not load standings: {result.error}</p>
    );
  }
  const table = result.table;

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
        </tr>
      </thead>
      <tbody>
        {table.map((row) => (
          <tr key={row.team.id} className="border-b">
            <td className="py-2">{row.position}</td>
            <td>{row.team.name}</td>
            <td>{row.playedGames}</td>
            <td>{row.won}</td>
            <td>{row.draw}</td>
            <td>{row.lost}</td>
            <td>{row.goalDifference}</td>
            <td className="font-semibold">{row.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-4 text-2xl font-semibold">Premier League</h1>
      <Suspense fallback={<p>Loading standings...</p>}>
        <Standings />
      </Suspense>
    </main>
  );
}
