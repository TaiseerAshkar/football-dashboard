import Link from "next/link";
import { Suspense } from "react";
import { ProbBar } from "@/app/components/ProbBar";
import { RetryNotice } from "@/app/components/RetryNotice";
import { ListSkeleton, TableSkeleton } from "@/app/components/Skeletons";
import { StandingsTable } from "@/app/components/StandingsTable";
import { buildFixtures, buildTeamInfos } from "@/lib/analysis";
import { getLiveAwareMatches, getScorers, type Scorer } from "@/lib/football";
import { LEAGUES, parseLeague, type LeagueCode } from "@/lib/leagues";
import { withLive } from "@/lib/live";
import { getStandings } from "@/lib/standings";

const card = "rounded-2xl border border-line bg-surface shadow-card";

async function Standings({ league }: { league: LeagueCode }) {
  const [standings, matches] = await Promise.all([
    getStandings(league),
    getLiveAwareMatches(league),
  ]);
  if (!standings.ok) {
    return <RetryNotice message={`Could not load standings: ${standings.error}`} />;
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
  const zones = LEAGUES.find((l) => l.code === league)!.zones;

  return (
    <>
      {anyLive && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-bad" />
          Live matches are counted in the table, so positions and points are provisional until full time.
        </div>
      )}
      <StandingsTable rows={rows} infos={infos} zones={zones} />
    </>
  );
}

const kickoffTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const kickoffDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

async function Fixtures({ league }: { league: LeagueCode }) {
  const matches = await getLiveAwareMatches(league);
  if (!matches.ok) return null; // the table section already shows the error
  const fixtures = buildFixtures(matches.data);
  const liveNow = matches.data.filter((m) => m.live);
  if (fixtures.length === 0 && liveNow.length === 0) return null;

  return (
    <section className="mt-8 space-y-6">
      {liveNow.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-bad" />
            Live now
          </h2>
          <ul className={`${card} divide-y divide-line`}>
            {liveNow.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                <span className="min-w-0 truncate">
                  {m.home.name}{" "}
                  <b className="mx-1 rounded-md bg-surface-2 px-2 py-0.5 tabular-nums">
                    {m.homeGoals}-{m.awayGoals}
                  </b>{" "}
                  {m.away.name}
                </span>
                <span className="rounded-full bg-bad px-2 py-0.5 text-[10px] font-bold text-white">LIVE</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fixtures.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Next fixtures</h2>
          <ul className={`${card} divide-y divide-line`}>
            {fixtures.map((f) => (
              <li key={f.id} className="flex gap-3 px-4 py-3.5">
                <div className="w-14 shrink-0 text-center leading-tight">
                  <div className="text-sm font-semibold tabular-nums">{kickoffTime(f.date)}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{kickoffDay(f.date)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3 text-sm font-medium">
                    <span className="min-w-0 truncate">{f.home}</span>
                    <span className="min-w-0 truncate text-right">{f.away}</span>
                  </div>
                  <ProbBar first={f.homeWin} draw={f.draw} second={f.awayWin} className="mt-2" />
                  <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
                    <span>{f.homeWin}%</span>
                    <span>Draw {f.draw}%</span>
                    <span>{f.awayWin}%</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5">Over 2.5 · {f.over25}%</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5">Both score · {f.btts}%</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5">Likely {f.likelyScore}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs text-muted">
            Kick-off times in UTC. Estimates from a simple goals model, not guarantees.
          </p>
        </div>
      )}
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
    <section className={`${card} p-4`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ol className="space-y-1">
        {players.map((p, i) => (
          <li
            key={p.name}
            className={`flex items-center gap-3 rounded-lg px-2 py-2 ${i === 0 ? "bg-accent-soft" : ""}`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                i === 0 ? "bg-accent text-white" : "bg-surface-2 text-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted">{p.teamName}</span>
            </span>
            <b className="text-lg tabular-nums">{p[stat]}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function Leaders({ league }: { league: LeagueCode }) {
  const result = await getScorers(league);
  if (!result.ok) {
    return <RetryNotice message={`Could not load top players: ${result.error}`} />;
  }
  const byGoals = [...result.data].sort((a, b) => b.goals - a.goals).slice(0, 5);
  const byAssists = [...result.data].sort((a, b) => b.assists - a.assists).slice(0, 5);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
    <div className="space-y-6">
      <nav
        aria-label="Leagues"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {LEAGUES.map((l) => (
          <Link
            key={l.code}
            href={`/?league=${l.code}`}
            aria-current={l.code === league ? "page" : undefined}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              l.code === league
                ? "border-accent bg-accent text-white shadow-card"
                : "border-line bg-surface text-muted hover:text-foreground"
            }`}
          >
            {l.name}
          </Link>
        ))}
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-8">
        <div className="min-w-0">
          <Suspense fallback={<TableSkeleton />}>
            <Standings league={league} />
          </Suspense>
          <Suspense fallback={null}>
            <Fixtures league={league} />
          </Suspense>
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Suspense fallback={<ListSkeleton />}>
            <Leaders league={league} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<TableSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
