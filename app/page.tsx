import Link from "next/link";
import { Suspense } from "react";
import { StandingsTable } from "@/app/components/StandingsTable";
import { buildTeamInfos } from "@/lib/analysis";
import { getHistory, getMatches, getScorers, type Scorer } from "@/lib/football";
import { LEAGUES, parseLeague, type LeagueCode } from "@/lib/leagues";
import { getStandings } from "@/lib/standings";

async function Standings({ league }: { league: LeagueCode }) {
  const [standings, matches, history] = await Promise.all([
    getStandings(league),
    getMatches(league),
    getHistory(league),
  ]);
  if (!standings.ok) {
    return <p className="text-red-600">Could not load standings: {standings.error}</p>;
  }

  // If the matches request failed, the table still shows; form and predictions are just empty.
  const infos = matches.ok
    ? buildTeamInfos(
        matches.data,
        history.ok ? history.data : [], // without history, head-to-head just uses this season
        standings.table.map((r) => ({ id: r.team.id, name: r.team.shortName ?? r.team.name })),
      )
    : {};

  return (
    <>
      <StandingsTable rows={standings.table} infos={infos} />
      <p className="mt-2 text-xs text-zinc-500">
        Click a team to see its next match prediction, last 5 games, and pros and cons.
      </p>
    </>
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
              {i + 1}. {p.name} <span className="text-zinc-500">({p.teamName})</span>
            </span>
            <span className="font-semibold">{p[stat]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function Leaders({ league }: { league: LeagueCode }) {
  const result = await getScorers(league);
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

// The selected league lives in the URL (?league=PD), so every league is linkable.
async function Dashboard({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const league = parseLeague((await searchParams).league);
  const name = LEAGUES.find((l) => l.code === league)!.name;

  return (
    <>
      <nav className="flex flex-wrap gap-2">
        {LEAGUES.map((l) => (
          <Link
            key={l.code}
            href={`/?league=${l.code}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              l.code === league ? "bg-foreground text-background" : "hover:bg-black/[.06] dark:hover:bg-white/[.1]"
            }`}
          >
            {l.name}
          </Link>
        ))}
      </nav>
      <section>
        <h1 className="mb-4 text-2xl font-semibold">{name}</h1>
        <Suspense fallback={<p>Loading standings...</p>}>
          <Standings league={league} />
        </Suspense>
      </section>
      <section>
        <Suspense fallback={<p>Loading top players...</p>}>
          <Leaders league={league} />
        </Suspense>
      </section>
    </>
  );
}

export default function Home({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <Suspense fallback={<p>Loading...</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
