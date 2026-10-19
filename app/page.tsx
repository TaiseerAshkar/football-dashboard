import Link from "next/link";
import { Suspense } from "react";
import { RetryNotice } from "@/app/components/RetryNotice";
import { StandingsTable } from "@/app/components/StandingsTable";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { buildFixtures, buildTeamInfos } from "@/lib/analysis";
import { getLiveAwareMatches, getScorers, type Scorer } from "@/lib/football";
import { withLive } from "@/lib/live";
import { LEAGUES, parseLeague, type LeagueCode } from "@/lib/leagues";
import { getStandings } from "@/lib/standings";

async function Standings({ league }: { league: LeagueCode }) {
  const [standings, matches] = await Promise.all([
    getStandings(league),
    getLiveAwareMatches(league),
  ]);
  if (!standings.ok) {
    return (
      <RetryNotice message={`Could not load standings: ${standings.error}`} />
    );
  }

  // If the matches request failed, the table still shows; form and predictions are just empty.
  const infos = matches.ok
    ? buildTeamInfos(
        matches.data,
        standings.table.map((r) => ({
          id: r.team.id,
          name: r.team.shortName ?? r.team.name,
        })),
      )
    : {};

  const { rows, anyLive } = matches.ok
    ? withLive(standings.table, matches.data)
    : { rows: standings.table, anyLive: false };

  return (
    <>
      {anyLive && (
        <p className="mb-2 text-sm text-red-600">
          Live matches are included in the table below, so positions and points are provisional until full time.
        </p>
      )}
      <StandingsTable rows={rows} infos={infos} />
      <p className="mt-2 text-xs text-zinc-500">
        Click a team to see its next match prediction, last 5 games, and pros
        and cons.
      </p>
    </>
  );
}

const formatKickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

async function Fixtures({ league }: { league: LeagueCode }) {
  const matches = await getLiveAwareMatches(league);
  if (!matches.ok) return null; // the table section already shows the error
  const fixtures = buildFixtures(matches.data);
  const liveNow = matches.data.filter((m) => m.live);
  if (fixtures.length === 0 && liveNow.length === 0) return null;

  return (
    <section className="mt-10">
      {liveNow.length > 0 && (
        <>
          <h2 className="mb-2 text-lg font-semibold text-red-600">Live now</h2>
          <ul className="mb-6 text-sm">
            {liveNow.map((m) => (
              <li key={m.id} className="flex justify-between gap-4 border-b py-2 font-medium">
                <span>
                  {m.home.name} {m.homeGoals}-{m.awayGoals} {m.away.name}
                </span>
                <span className="rounded bg-red-600 px-1.5 text-xs font-bold text-white">LIVE</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="mb-2 text-lg font-semibold">Next fixtures</h2>
      <ul className="text-sm">
        {fixtures.map((f) => (
          <li key={f.id} className="border-b py-2">
            <div className="flex flex-wrap justify-between gap-x-4">
              <span className="font-medium">
                {f.home} vs {f.away}
              </span>
              <span className="text-zinc-500">{formatKickoff(f.date)} UTC</span>
            </div>
            <div className="text-zinc-500">
              {f.home} {f.homeWin}% · Draw {f.draw}% · {f.away} {f.awayWin}% ·
              Over 2.5 {f.over25}% · Both score {f.btts}% · Likely{" "}
              {f.likelyScore}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-zinc-500">
        Estimates from a simple goals model, not guarantees.
      </p>
    </section>
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
              <span className="text-zinc-500">({p.teamName})</span>
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
    return (
      <RetryNotice message={`Could not load top players: ${result.error}`} />
    );
  }
  const byGoals = [...result.data]
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 5);
  const byAssists = [...result.data]
    .sort((a, b) => b.assists - a.assists)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <TopFive title="Top scorers" players={byGoals} stat="goals" />
      <TopFive title="Top assisters" players={byAssists} stat="assists" />
    </div>
  );
}

// The selected league lives in the URL (?league=PD), so every league is linkable.
async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const league = parseLeague((await searchParams).league);
  const name = LEAGUES.find((l) => l.code === league)!.name;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-2">
          {LEAGUES.map((l) => (
            <Link
              key={l.code}
              href={`/?league=${l.code}`}
              className={`rounded-full border px-3 py-1 text-sm ${
                l.code === league
                  ? "bg-foreground text-background"
                  : "hover:bg-black/[.06] dark:hover:bg-white/[.1]"
              }`}
            >
              {l.name}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section>
          <h1 className="mb-4 text-2xl font-semibold">{name}</h1>
          <Suspense fallback={<p>Loading standings...</p>}>
            <Standings league={league} />
          </Suspense>
          <Suspense fallback={null}>
            <Fixtures league={league} />
          </Suspense>
        </section>
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Suspense fallback={<p>Loading top players...</p>}>
            <Leaders league={league} />
          </Suspense>
        </aside>
      </div>
    </>
  );
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
      <Suspense fallback={<p>Loading...</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
