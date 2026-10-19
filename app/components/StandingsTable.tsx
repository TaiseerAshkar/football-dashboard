"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { FormBadges } from "@/app/components/FormBadges";
import { ProbBar } from "@/app/components/ProbBar";
import type { TeamInfo } from "@/lib/analysis";
import type { Match } from "@/lib/football";
import { useFavourite } from "@/lib/favourite";
import { headToHead } from "@/lib/h2h";
import { zoneFor, type ZoneKind, type Zones } from "@/lib/leagues";
import type { LiveRow } from "@/lib/live";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const formatFull = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const formatShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const ZONE_CHIP: Record<ZoneKind | "none", string> = {
  top: "bg-good/15 text-good",
  mid: "bg-info/15 text-info",
  bottom: "bg-bad/15 text-bad",
  none: "text-muted",
};
const ZONE_DOT: Record<ZoneKind, string> = { top: "bg-good", mid: "bg-info", bottom: "bg-bad" };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-[11px] leading-tight text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs">
      <span className="text-muted">{label}</span>
      <b className="tabular-nums">{value}</b>
    </span>
  );
}

// Loads past meetings only when a team is opened (one API request per fixture,
// cached for a day), then shows the last 5 at the ground and facts about them.
function HeadToHead({
  matchId,
  teamId,
  opponent,
  teamIsHome,
}: {
  matchId: number;
  teamId: number;
  opponent: string;
  teamIsHome: boolean;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; matches: Match[] }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // If the API's per-minute limit is hit, try again every 8 seconds (up to 8 times).
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetch(`/api/h2h?match=${matchId}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load head-to-head");
        setState({ status: "ok", matches: body });
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setState({ status: "error", message: e.message });
        if (attempt < 8) timer = setTimeout(() => setAttempt(attempt + 1), 8000);
      });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [matchId, attempt]);

  if (state.status === "loading") {
    return (
      <div className="space-y-2" aria-busy>
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p className="flex items-center gap-2 text-sm text-warn">
        <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
          <path d="M21 12a9 9 0 1 1-6.2-8.55" strokeLinecap="round" />
        </svg>
        {state.message}. Trying again...
      </p>
    );
  }

  const { facts, atGround } = headToHead(state.matches, teamId, opponent, teamIsHome);
  return (
    <>
      <ul className="space-y-1.5 text-sm">
        {facts.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {f}
          </li>
        ))}
      </ul>
      {atGround.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line text-xs text-muted">
          {atGround.map((m) => (
            <li key={m.id} className="flex justify-between gap-3 py-1.5">
              <span>{formatFull(m.date)}</span>
              <span className="text-right">
                {m.home.name} <b className="text-foreground tabular-nums">{m.homeGoals}-{m.awayGoals}</b> {m.away.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Bullets({ items, tone }: { items: string[]; tone: "good" | "bad" }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Nothing stands out</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className={`mt-0.5 font-bold ${tone === "good" ? "text-good" : "text-bad"}`}>
            {tone === "good" ? "+" : "−"}
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function TeamPanel({ info, teamId, name, league }: { info: TeamInfo; teamId: number; name: string; league: string }) {
  const { next, stats, pros, cons, games } = info;
  return (
    <div className="space-y-3 p-3 sm:p-5">
      <div className="flex justify-end">
        <Link href={`/team/${league}/${teamId}`} className="text-sm font-medium text-accent hover:underline">
          Full team stats →
        </Link>
      </div>
      {next ? (
        <Card title="Next match">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-lg font-semibold">
              {name} <span className="text-muted">{next.home ? "vs" : "@"}</span> {next.opponent}
            </p>
            <p className="text-sm text-muted">{formatDate(next.date)}</p>
          </div>

          <ProbBar first={next.win} draw={next.draw} second={next.loss} className="mt-3" />
          <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted">
            <span>
              {name} <b className="text-foreground">{next.win}%</b>
            </span>
            <span>
              Draw <b className="text-foreground">{next.draw}%</b>
            </span>
            <span>
              {next.opponent} <b className="text-foreground">{next.loss}%</b>
            </span>
          </div>

          <ul className="mt-4 space-y-1.5 text-sm font-medium">
            {next.headline.map((h) => (
              <li key={h} className="flex gap-2">
                <span className="text-accent">✓</span>
                {h}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="Over 2.5" value={`${next.over25}%`} />
            <Chip label="Both score" value={`${next.btts}%`} />
            <Chip label="Expected goals" value={`${next.xgFor.toFixed(1)}-${next.xgAgainst.toFixed(1)}`} />
            <Chip label="Likely score" value={next.likelyScore} />
          </div>
        </Card>
      ) : (
        <Card title="Next match">
          <p className="text-sm text-muted">No upcoming match found.</p>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        {next && (
          <Card title={`Head-to-head at ${next.home ? "home" : "their ground"}`}>
            <HeadToHead
              matchId={next.matchId}
              teamId={teamId}
              opponent={next.opponent}
              teamIsHome={next.home}
            />
          </Card>
        )}
        <Card title={`Last ${games.length} matches`}>
          <ul className="divide-y divide-line text-sm">
            {games.map((g) => (
              <li key={g.date} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <FormBadges games={[g]} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted">{formatShort(g.date)}</span>{" "}
                  {g.home ? "vs" : "@"} {g.opponent}
                </span>
                <b className="tabular-nums">
                  {g.gf}-{g.ga}
                </b>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={`Season facts · ${stats.played} games`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Scores per game" value={stats.goalsFor.toFixed(1)} />
          <Stat label="Concedes per game" value={stats.goalsAgainst.toFixed(1)} />
          <Stat label="Over 2.5 goals" value={`${stats.over25}%`} />
          <Stat label="Both teams scored" value={`${stats.btts}%`} />
          <Stat label="Clean sheets" value={`${stats.cleanSheets}%`} />
          <Stat label="Failed to score" value={`${stats.failedToScore}%`} />
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-good/30 bg-good/5 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-good">
            Pros · reasons to back them
          </h3>
          <Bullets items={pros} tone="good" />
        </section>
        <section className="rounded-xl border border-bad/30 bg-bad/5 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-bad">
            Cons · reasons to be careful
          </h3>
          <Bullets items={cons} tone="bad" />
        </section>
      </div>

      <p className="px-1 text-xs text-muted">
        Estimates from past results using a simple goals model, not guarantees. Corner stats aren&apos;t
        available from the free data source.
      </p>
    </div>
  );
}

export function StandingsTable({
  rows,
  infos,
  zones,
  league,
}: {
  rows: LiveRow[];
  infos: Record<number, TeamInfo>;
  zones: Zones;
  league: string;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const fav = useFavourite();
  const legend = (["top", "mid", "bottom"] as const).flatMap((k) => (zones[k] ? [{ k, label: zones[k]!.label }] : []));

  return (
    <div>
      <div className="fade-up overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-surface-2/60 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 py-2.5 pl-4 pr-1 text-left font-medium">#</th>
              <th className="w-full px-2 text-left font-medium">Team</th>
              <th className="hidden px-2 text-center font-medium sm:table-cell">P</th>
              <th className="hidden px-2 text-center font-medium sm:table-cell">W</th>
              <th className="hidden px-2 text-center font-medium sm:table-cell">D</th>
              <th className="hidden px-2 text-center font-medium sm:table-cell">L</th>
              <th className="hidden px-2 text-center font-medium sm:table-cell">GD</th>
              <th className="px-2 text-center font-medium">Pts</th>
              <th className="py-2.5 pl-2 pr-3 text-left font-medium sm:pr-4">Form</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const info = infos[row.team.id];
              const open = openId === row.team.id;
              const zone = zoneFor(row.position, rows.length, zones) ?? "none";
              const name = row.team.shortName ?? row.team.name;
              const isFav = fav?.id === row.team.id;
              return (
                <Fragment key={row.team.id}>
                  <tr
                    onClick={() => setOpenId(open ? null : row.team.id)}
                    className={`cursor-pointer border-t border-line transition-colors hover:bg-surface-2/60 ${
                      open ? "bg-surface-2/60" : isFav ? "bg-amber-400/10" : ""
                    }`}
                  >
                    <td className="py-3 pl-3 pr-1">
                      <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${ZONE_CHIP[zone]}`}>
                        {row.position}
                      </span>
                    </td>
                    <td className="w-full max-w-0 px-2">
                      <button
                        type="button"
                        aria-expanded={open}
                        className="flex w-full items-center gap-2.5 text-left font-medium"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white p-1 shadow-sm ring-1 ring-black/5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={row.team.crest}
                            alt=""
                            width={24}
                            height={24}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        </span>
                        <span className="truncate sm:hidden">{name}</span>
                        <span className="hidden truncate sm:inline">{row.team.name}</span>
                        {isFav && (
                          <span className="shrink-0 text-amber-400" title="Your favourite team" aria-label="Your favourite team">
                            ★
                          </span>
                        )}
                        {row.live && (
                          <span
                            title={`Live ${row.live.home ? "vs" : "@"} ${row.live.opponent}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-bold text-bad"
                          >
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />
                            {row.live.gf}-{row.live.ga}
                          </span>
                        )}
                        <svg
                          className={`ml-auto hidden h-3.5 w-3.5 shrink-0 text-muted transition-transform sm:block ${open ? "rotate-90" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </button>
                    </td>
                    <td className="hidden px-2 text-center text-muted sm:table-cell">{row.playedGames}</td>
                    <td className="hidden px-2 text-center text-muted sm:table-cell">{row.won}</td>
                    <td className="hidden px-2 text-center text-muted sm:table-cell">{row.draw}</td>
                    <td className="hidden px-2 text-center text-muted sm:table-cell">{row.lost}</td>
                    <td className="hidden px-2 text-center text-muted sm:table-cell">
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </td>
                    <td className="px-1 text-center text-base font-bold sm:px-2">{row.points}</td>
                    <td className="py-3 pl-2 pr-3 sm:pr-4">
                      {info && <FormBadges games={info.games} />}
                    </td>
                  </tr>
                  {open && info && (
                    <tr className="border-t border-line bg-surface-2/40">
                      <td colSpan={9} className="p-0">
                        <TeamPanel info={info} teamId={row.team.id} name={name} league={league} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted">
        {legend.map((l) => (
          <span key={l.k} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${ZONE_DOT[l.k]}`} />
            {l.label}
          </span>
        ))}
        <span>Tap a team for its next-match prediction, form and pros and cons.</span>
      </div>
    </div>
  );
}
