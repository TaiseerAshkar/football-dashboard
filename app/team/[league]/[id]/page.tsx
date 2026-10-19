import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormBadges } from "@/app/components/FormBadges";
import { RetryNotice } from "@/app/components/RetryNotice";
import { TableSkeleton } from "@/app/components/Skeletons";
import { getMatches, getScorers } from "@/lib/football";
import { LEAGUES } from "@/lib/leagues";
import { getStandings } from "@/lib/standings";
import { buildTeamPage, type Split, type TeamGame } from "@/lib/teamStats";

export const metadata = { title: "Team stats" };

const card = "rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5";

const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const kickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-[11px] leading-tight text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

const perGame = (n: number, played: number) => (played ? (n / played).toFixed(2) : "0.00");

function SplitRow({ label, s }: { label: string; s: Split }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2.5 pr-3 font-medium">{label}</td>
      <td className="px-1.5 text-center sm:px-2">{s.played}</td>
      <td className="px-1.5 text-center sm:px-2">{s.won}</td>
      <td className="px-1.5 text-center sm:px-2">{s.draw}</td>
      <td className="px-1.5 text-center sm:px-2">{s.lost}</td>
      <td className="px-1.5 text-center sm:px-2">
        {s.gf}:{s.ga}
      </td>
      <td className="px-1.5 text-center sm:px-2 font-semibold">{perGame(s.points, s.played)}</td>
    </tr>
  );
}

const RESULT_BORDER = { W: "border-t-good", D: "border-t-muted", L: "border-t-bad" };

// Last 10 games, oldest on the left: a coloured strip with the score.
function ResultsStrip({ games }: { games: TeamGame[] }) {
  const recent = games.slice(0, 10).reverse();
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {recent.map((g) => (
        <div
          key={g.date}
          title={`${g.home ? "vs" : "@"} ${g.opponent}`}
          className={`min-w-[4.5rem] flex-1 rounded-lg border border-line border-t-4 bg-surface-2 px-2 py-2 text-center ${RESULT_BORDER[g.result]}`}
        >
          <div className="text-base font-bold tabular-nums">
            {g.gf}-{g.ga}
          </div>
          <div className="truncate text-[11px] text-muted">
            {g.home ? "vs" : "@"} {g.opponent}
          </div>
          <div className="text-[10px] text-muted">{shortDate(g.date)}</div>
        </div>
      ))}
    </div>
  );
}

// Goals scored (green) and conceded (red) in each of the last 10 games.
function GoalsChart({ games }: { games: TeamGame[] }) {
  const recent = games.slice(0, 10).reverse();
  const max = Math.max(3, ...recent.flatMap((g) => [g.gf, g.ga]));
  const bar = (n: number) => (n === 0 ? "3px" : `${(n / max) * 100}%`);
  return (
    <div>
      <div className="flex h-28 items-end gap-2">
        {recent.map((g) => (
          <div key={g.date} className="flex h-full flex-1 items-end justify-center gap-1" title={`${g.opponent}: ${g.gf} scored, ${g.ga} conceded`}>
            <div className="flex h-full w-3 flex-col justify-end">
              <span className="mb-0.5 text-center text-[10px] tabular-nums text-muted">{g.gf}</span>
              <div className="rounded-t bg-accent" style={{ height: bar(g.gf) }} />
            </div>
            <div className="flex h-full w-3 flex-col justify-end">
              <span className="mb-0.5 text-center text-[10px] tabular-nums text-muted">{g.ga}</span>
              <div className="rounded-t bg-bad/70" style={{ height: bar(g.ga) }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent" /> Scored
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-bad/70" /> Conceded
        </span>
      </div>
    </div>
  );
}

async function TeamDetails({ params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  const lg = LEAGUES.find((l) => l.code === league);
  const teamId = Number(id);
  if (!lg || !Number.isInteger(teamId)) notFound();

  const [standings, matches, scorers] = await Promise.all([
    getStandings(lg.code),
    getMatches(lg.code),
    getScorers(lg.code),
  ]);
  if (!standings.ok) return <RetryNotice message={`Could not load the table: ${standings.error}`} />;
  const row = standings.table.find((r) => r.team.id === teamId);
  if (!row) notFound();
  if (!matches.ok) return <RetryNotice message={`Could not load matches: ${matches.error}`} />;

  const data = buildTeamPage(matches.data, teamId);
  const players = scorers.ok
    ? scorers.data.filter((s) => s.teamId === teamId).sort((a, b) => b.goals - a.goals).slice(0, 5)
    : [];
  const t = data.total;

  return (
    <div className="fade-up space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.team.crest} alt="" width={64} height={64} className="h-16 w-16 object-contain" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-3xl">{row.team.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {lg.name} · position <b className="text-foreground">{row.position}</b> · <b className="text-foreground">{row.points}</b> pts
          </p>
        </div>
        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
          <FormBadges games={data.games.slice(0, 5)} />
          <Link href={`/compare?league=${lg.code}&a=${teamId}`} className="text-sm font-medium text-accent hover:underline">
            Compare with another team →
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Played" value={String(t.played)} />
        <Stat label="Record" value={`${t.won}-${t.draw}-${t.lost}`} />
        <Stat label="Scores / game" value={perGame(t.gf, t.played)} />
        <Stat label="Concedes / game" value={perGame(t.ga, t.played)} />
        <Stat label="Clean sheets" value={`${data.cleanSheets}%`} />
        <Stat label="Failed to score" value={`${data.failedToScore}%`} />
        <Stat label="Over 2.5 goals" value={`${data.over25}%`} />
        <Stat label="Both scored" value={`${data.btts}%`} />
      </section>

      {data.games.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <section className={card}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Last 10 results</h2>
            <ResultsStrip games={data.games} />
          </section>
          <section className={card}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Goals in the last 10 games</h2>
            <GoalsChart games={data.games} />
          </section>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Home and away</h2>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-2 pr-3 text-left font-medium"> </th>
                <th className="px-1.5 text-center sm:px-2 font-medium">P</th>
                <th className="px-1.5 text-center sm:px-2 font-medium">W</th>
                <th className="px-1.5 text-center sm:px-2 font-medium">D</th>
                <th className="px-1.5 text-center sm:px-2 font-medium">L</th>
                <th className="px-1.5 text-center sm:px-2 font-medium">Goals</th>
                <th className="px-1.5 text-center sm:px-2 font-medium">Pts/g</th>
              </tr>
            </thead>
            <tbody>
              <SplitRow label="Home" s={data.home} />
              <SplitRow label="Away" s={data.away} />
              <SplitRow label="All" s={data.total} />
            </tbody>
          </table>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Next fixtures</h2>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted">No upcoming matches found.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.upcoming.map((f) => (
                <li key={f.date} className="flex justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="font-medium">
                    {f.home ? "vs" : "@"} {f.opponent}
                  </span>
                  <span className="text-muted">{kickoff(f.date)} UTC</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {players.length > 0 && (
        <section className={card}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Top scorers in this competition</h2>
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {players.map((p) => (
              <li key={p.name} className="rounded-xl bg-surface-2 p-3">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="mt-1 text-xs text-muted">
                  <b className="text-base text-foreground tabular-nums">{p.goals}</b> goals · {p.assists} assists
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className={card}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">All results this season</h2>
        <ul className="divide-y divide-line text-sm">
          {data.games.map((g) => (
            <li key={g.date} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <FormBadges games={[g]} size="sm" />
              <span className="w-24 shrink-0 text-muted">{fullDate(g.date)}</span>
              <span className="min-w-0 flex-1 truncate">
                {g.home ? "vs" : "@"} {g.opponent}
              </span>
              <b className="tabular-nums">
                {g.gf}-{g.ga}
              </b>
            </li>
          ))}
          {data.games.length === 0 && <li className="text-muted">No finished matches yet.</li>}
        </ul>
      </section>
    </div>
  );
}

export default function TeamPage({ params }: { params: Promise<{ league: string; id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/" className="inline-block text-sm font-medium text-accent hover:underline">
        ← Back to tables
      </Link>
      <Suspense fallback={<TableSkeleton />}>
        <TeamDetails params={params} />
      </Suspense>
    </main>
  );
}
