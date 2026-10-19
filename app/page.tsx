import Link from "next/link";
import { Suspense } from "react";
import { FavouriteCard } from "@/app/components/FavouriteCard";
import { ProbBar } from "@/app/components/ProbBar";
import { RetryNotice } from "@/app/components/RetryNotice";
import { ListSkeleton, StoriesSkeleton, TableSkeleton } from "@/app/components/Skeletons";
import { StandingsTable } from "@/app/components/StandingsTable";
import { TipOfTheDay } from "@/app/components/TipOfTheDay";
import { buildFixtures, buildTeamInfos } from "@/lib/analysis";
import { getLiveAwareMatches, getMatches, getScorers, type Scorer } from "@/lib/football";
import { LEAGUES, parseLeague, type LeagueCode } from "@/lib/leagues";
import { withLive } from "@/lib/live";
import { getStandings } from "@/lib/standings";
import { buildStories, leagueStats, type Story } from "@/lib/stories";

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
      <StandingsTable rows={rows} infos={infos} zones={zones} league={league} />
    </>
  );
}

// ---- the four quick numbers in the hero card ----
async function Pulse({ league }: { league: LeagueCode }) {
  const matches = await getMatches(league);
  const stats = matches.ok ? leagueStats(matches.data) : null;
  if (!stats) return null;
  const tiles = [
    { label: "Matches played", value: String(stats.played) },
    { label: "Goals per game", value: stats.goalsPerGame.toFixed(2) },
    { label: "Home wins", value: `${stats.homeWins}%` },
    { label: "Over 2.5 goals", value: `${stats.over25}%` },
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl bg-background/60 px-3.5 py-3 ring-1 ring-line backdrop-blur">
          <div className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{t.value}</div>
          <div className="mt-0.5 text-xs text-muted">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---- auto-written stories ----
const TONE: Record<Story["tone"], { bar: string; chip: string }> = {
  good: { bar: "before:bg-good", chip: "bg-good/15" },
  bad: { bar: "before:bg-bad", chip: "bg-bad/15" },
  info: { bar: "before:bg-info", chip: "bg-info/15" },
};

async function Stories({ league }: { league: LeagueCode }) {
  const [standings, matches] = await Promise.all([getStandings(league), getMatches(league)]);
  if (!standings.ok || !matches.ok) return null;
  const stories = buildStories(matches.data, standings.table);
  if (stories.length === 0) return null;

  return (
    <section aria-label="Stories">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Stories</h2>
        <p className="text-xs text-muted">Written automatically from the latest results</p>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {stories.map((s, i) => {
          const body = (
            <>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${TONE[s.tone].chip}`}>
                {s.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug">{s.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{s.detail}</span>
              </span>
            </>
          );
          const cls = `card-lift fade-up relative flex min-w-[15.5rem] snap-start items-start gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-3.5 pl-4 shadow-card before:absolute before:inset-y-0 before:left-0 before:w-1 sm:min-w-0 ${TONE[s.tone].bar}`;
          const style = { animationDelay: `${i * 50}ms` };
          return s.teamId ? (
            <Link key={s.id} href={`/team/${league}/${s.teamId}`} className={cls} style={style}>
              {body}
            </Link>
          ) : (
            <div key={s.id} className={cls} style={style}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
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
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight">
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
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Next fixtures</h2>
          <ul className={`${card} divide-y divide-line overflow-hidden`}>
            {fixtures.map((f) => (
              <li key={f.id} className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/50">
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

// gold, silver and bronze for the top three
const MEDAL = [
  "bg-amber-400 text-amber-950",
  "bg-slate-300 text-slate-800",
  "bg-orange-300 text-orange-950",
];

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
    <section className={`${card} fade-up p-4`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ol className="space-y-1">
        {players.map((p, i) => (
          <li
            key={p.name}
            className={`flex items-center gap-3 rounded-xl px-2 py-2 transition-colors ${
              i === 0 ? "bg-accent-soft" : "hover:bg-surface-2/60"
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                MEDAL[i] ?? "bg-surface-2 text-muted"
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              l.code === league
                ? "border-accent bg-accent text-white shadow-[0_8px_24px_-8px_var(--accent)]"
                : "border-line bg-surface/70 text-muted backdrop-blur hover:border-accent/50 hover:text-foreground"
            }`}
          >
            {l.name}
          </Link>
        ))}
      </nav>

      <FavouriteCard />

      <section className="fade-up relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-info/10 blur-3xl" />
        <svg
          aria-hidden
          viewBox="0 0 220 220"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute -bottom-20 -right-12 h-72 w-72 text-foreground/[.07]"
        >
          <circle cx="110" cy="110" r="70" />
          <circle cx="110" cy="110" r="5" fill="currentColor" />
          <path d="M110 20v180M20 110h180" />
          <rect x="62" y="20" width="96" height="40" />
          <rect x="62" y="160" width="96" height="40" />
        </svg>
        <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-accent">League table</p>
        <h1 className="relative mt-1.5 text-4xl font-extrabold tracking-tight sm:text-6xl">{name}</h1>
        <div className="relative">
          <Suspense fallback={null}>
            <Pulse league={league} />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={<StoriesSkeleton />}>
        <Stories league={league} />
      </Suspense>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-8">
        <div className="min-w-0">
          <div className="mb-6 lg:hidden">
            <Suspense fallback={null}>
              <TipOfTheDay />
            </Suspense>
          </div>
          <Suspense fallback={<TableSkeleton />}>
            <Standings league={league} />
          </Suspense>
          <Suspense fallback={null}>
            <Fixtures league={league} />
          </Suspense>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            <Suspense fallback={null}>
              <TipOfTheDay />
            </Suspense>
          </div>
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
