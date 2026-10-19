import { Suspense } from "react";
import { ComparePicker } from "@/app/components/ComparePicker";
import { FormBadges } from "@/app/components/FormBadges";
import { ProbBar } from "@/app/components/ProbBar";
import { RetryNotice } from "@/app/components/RetryNotice";
import { TableSkeleton } from "@/app/components/Skeletons";
import { matchup } from "@/lib/analysis";
import { getMatches } from "@/lib/football";
import { LEAGUES, parseLeague } from "@/lib/leagues";
import { getStandings } from "@/lib/standings";
import { buildTeamPage, type TeamPage } from "@/lib/teamStats";

export const metadata = { title: "Compare teams" };

type Search = Promise<{ league?: string; a?: string; b?: string }>;

const card = "rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5";

// One metric as two bars growing outward from the middle. The better side is bold.
function DualRow({
  label,
  a,
  b,
  fmt,
  lowerBetter = false,
}: {
  label: string;
  a: number;
  b: number;
  fmt: (v: number) => string;
  lowerBetter?: boolean;
}) {
  const aWins = a !== b && (lowerBetter ? a < b : a > b);
  const bWins = a !== b && (lowerBetter ? b < a : b > a);
  // a longer bar always means better, so for "lower is better" rows the bar is flipped
  const best = lowerBetter ? Math.min(a, b) : Math.max(a, b);
  const fill = (v: number) => (lowerBetter ? (v === 0 ? 100 : (best / v) * 100) : best === 0 ? 0 : (v / best) * 100);
  const width = (v: number) => `${Math.max(3, fill(v))}%`;
  return (
    <div className="py-2.5">
      <div className="mb-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm tabular-nums">
        <span className={aWins ? "font-bold" : "text-muted"}>{fmt(a)}</span>
        <span className="text-xs text-muted">{label}</span>
        <span className={`text-right ${bWins ? "font-bold" : "text-muted"}`}>{fmt(b)}</span>
      </div>
      <div className="flex h-2 gap-1">
        <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${aWins ? "bg-accent" : "bg-accent/40"}`} style={{ width: width(a) }} />
        </div>
        <div className="flex flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${bWins ? "bg-info" : "bg-info/40"}`} style={{ width: width(b) }} />
        </div>
      </div>
    </div>
  );
}

function TeamHead({
  name,
  crest,
  position,
  points,
  page,
  tone,
}: {
  name: string;
  crest: string;
  position: number;
  points: number;
  page: TeamPage;
  tone: "accent" | "info";
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className={`grid h-20 w-20 place-items-center rounded-full bg-white p-2.5 shadow-card ring-4 ${tone === "accent" ? "ring-accent/30" : "ring-info/30"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={crest} alt="" width={64} height={64} className="h-full w-full object-contain" />
      </span>
      <h2 className="mt-3 text-lg font-semibold leading-tight sm:text-xl">{name}</h2>
      <p className="mt-0.5 text-xs text-muted">
        Position <b className="text-foreground">{position}</b> · <b className="text-foreground">{points}</b> pts
      </p>
      <div className="mt-2">
        <FormBadges games={page.games.slice(0, 5)} />
      </div>
    </div>
  );
}

async function Compare({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const league = parseLeague(sp.league);
  const [standings, matches] = await Promise.all([getStandings(league), getMatches(league)]);
  if (!standings.ok) return <RetryNotice message={`Could not load the table: ${standings.error}`} />;
  if (!matches.ok) return <RetryNotice message={`Could not load matches: ${matches.error}`} />;

  const rows = standings.table;
  const teams = [...rows]
    .map((r) => ({ id: r.team.id, name: r.team.shortName ?? r.team.name }))
    .sort((x, y) => x.name.localeCompare(y.name));
  // by default: the top two teams, a title clash
  const aId = rows.some((r) => r.team.id === Number(sp.a)) ? Number(sp.a) : rows[0].team.id;
  const bId = rows.some((r) => r.team.id === Number(sp.b)) ? Number(sp.b) : (rows.find((r) => r.team.id !== aId) ?? rows[0]).team.id;
  const ra = rows.find((r) => r.team.id === aId)!;
  const rb = rows.find((r) => r.team.id === bId)!;
  const nameA = ra.team.shortName ?? ra.team.name;
  const nameB = rb.team.shortName ?? rb.team.name;

  const pa = buildTeamPage(matches.data, aId);
  const pb = buildTeamPage(matches.data, bId);
  const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
  const perGame = (n: number, d: number) => (d ? n / d : 0);
  const num = (v: number) => v.toFixed(2);
  const percent = (v: number) => `${Math.round(v)}%`;

  const aHome = matchup(matches.data, aId, bId); // team A hosts team B
  const bHome = matchup(matches.data, bId, aId); // team B hosts team A

  const scenarios = [
    {
      title: `If ${nameA} host ${nameB}`,
      a: aHome.homeWin,
      draw: aHome.draw,
      b: aHome.awayWin,
      score: aHome.score,
      over25: aHome.over25,
      btts: aHome.btts,
    },
    {
      title: `If ${nameB} host ${nameA}`,
      a: bHome.awayWin,
      draw: bHome.draw,
      b: bHome.homeWin,
      score: bHome.score.split("-").reverse().join("-"), // always shown as A-B
      over25: bHome.over25,
      btts: bHome.btts,
    },
  ];

  return (
    <div className="fade-up space-y-6">
      <section className={card}>
        <ComparePicker league={league} leagues={LEAGUES.map((l) => ({ code: l.code, name: l.name }))} teams={teams} a={aId} b={bId} />
      </section>

      <section className={card}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <TeamHead name={nameA} crest={ra.team.crest} position={ra.position} points={ra.points} page={pa} tone="accent" />
          <span className="mt-6 grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted">VS</span>
          <TeamHead name={nameB} crest={rb.team.crest} position={rb.position} points={rb.points} page={pb} tone="info" />
        </div>

        <div className="mt-5 divide-y divide-line border-t border-line">
          <DualRow label="League position" a={ra.position} b={rb.position} fmt={(v) => `#${v}`} lowerBetter />
          <DualRow label="Points" a={ra.points} b={rb.points} fmt={(v) => String(v)} />
          <DualRow label="Win rate" a={pct(pa.total.won, pa.total.played)} b={pct(pb.total.won, pb.total.played)} fmt={percent} />
          <DualRow label="Goals scored per game" a={perGame(pa.total.gf, pa.total.played)} b={perGame(pb.total.gf, pb.total.played)} fmt={num} />
          <DualRow label="Goals conceded per game" a={perGame(pa.total.ga, pa.total.played)} b={perGame(pb.total.ga, pb.total.played)} fmt={num} lowerBetter />
          <DualRow label="Clean sheets" a={pa.cleanSheets} b={pb.cleanSheets} fmt={percent} />
          <DualRow label="Failed to score" a={pa.failedToScore} b={pb.failedToScore} fmt={percent} lowerBetter />
          <DualRow label="Over 2.5 goals" a={pa.over25} b={pb.over25} fmt={percent} />
          <DualRow label="Both teams scored" a={pa.btts} b={pb.btts} fmt={percent} />
          <DualRow label="Home points per game" a={perGame(pa.home.points, pa.home.played)} b={perGame(pb.home.points, pb.home.played)} fmt={num} />
          <DualRow label="Away points per game" a={perGame(pa.away.points, pa.away.played)} b={perGame(pb.away.points, pb.away.played)} fmt={num} />
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Predicted result</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {scenarios.map((s) => (
            <div key={s.title}>
              <p className="mb-2 text-sm font-semibold">{s.title}</p>
              <ProbBar first={s.a} draw={s.draw} second={s.b} />
              <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted">
                <span>
                  {nameA} <b className="text-foreground">{s.a}%</b>
                </span>
                <span>
                  Draw <b className="text-foreground">{s.draw}%</b>
                </span>
                <span>
                  {nameB} <b className="text-foreground">{s.b}%</b>
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-surface-2 px-2.5 py-1">Likely score {s.score}</span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1">Over 2.5 · {s.over25}%</span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1">Both score · {s.btts}%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Estimates from this season&apos;s results with a simple goals model, not guarantees. Both teams must be in the
          same league.
        </p>
      </section>
    </div>
  );
}

export default function ComparePage({ searchParams }: { searchParams: Search }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Compare teams</h1>
        <p className="mt-2 text-sm text-muted">
          Pick two clubs from the same league and see them side by side, with a predicted result.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
