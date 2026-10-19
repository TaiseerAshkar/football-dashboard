"use client";

import { Fragment, useEffect, useState } from "react";
import { FormBadges } from "@/app/components/FormBadges";
import type { TeamInfo } from "@/lib/analysis";
import type { Match } from "@/lib/football";
import { headToHead } from "@/lib/h2h";
import type { StandingRow } from "@/lib/standings";

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
    { status: "loading" } | { status: "error"; message: string } | { status: "ok"; matches: Match[] }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/h2h?match=${matchId}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load head-to-head");
        setState({ status: "ok", matches: body });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setState({ status: "error", message: e.message });
      });
    return () => controller.abort();
  }, [matchId]);

  if (state.status === "loading") return <p className="text-zinc-500">Loading head-to-head...</p>;
  if (state.status === "error") return <p className="text-red-600">{state.message}</p>;

  const { facts, atGround } = headToHead(state.matches, teamId, opponent, teamIsHome);
  return (
    <>
      <ul className="list-disc pl-5">
        {facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {atGround.length > 0 && (
        <ul className="mt-2 text-zinc-500">
          {atGround.map((m) => (
            <li key={m.id}>
              {formatFull(m.date)}: {m.home.name} {m.homeGoals}-{m.awayGoals} {m.away.name}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TeamPanel({ info, teamId }: { info: TeamInfo; teamId: number }) {
  const { next, stats, pros, cons, games } = info;
  return (
    <div className="space-y-5 rounded bg-black/[.04] p-4 text-sm dark:bg-white/[.06]">
      {next ? (
        <div>
          <h3 className="mb-1 font-semibold">
            Next match: {next.home ? "vs" : "@"} {next.opponent} · {formatDate(next.date)}
          </h3>
          <ul className="mb-2 list-disc pl-5 font-medium">
            {next.headline.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <p className="text-zinc-500">
            Win {next.win}% · Draw {next.draw}% · Loss {next.loss}% · Over 2.5 goals {next.over25}% ·
            Both teams to score {next.btts}% · Expected goals {next.xgFor.toFixed(1)}-
            {next.xgAgainst.toFixed(1)} · Most likely score {next.likelyScore}
          </p>
          <h3 className="mb-1 mt-4 font-semibold">
            Head-to-head at {next.home ? "home" : "their ground"} vs {next.opponent}
          </h3>
          <HeadToHead
            matchId={next.matchId}
            teamId={teamId}
            opponent={next.opponent}
            teamIsHome={next.home}
          />
        </div>
      ) : (
        <p>No upcoming match found.</p>
      )}

      <div>
        <h3 className="mb-1 font-semibold">Last {games.length} matches</h3>
        <ul>
          {games.map((g) => (
            <li key={g.date} className="flex justify-between border-b py-0.5">
              <span>
                <span className="text-zinc-500">{formatFull(g.date)}</span> {g.home ? "vs" : "@"}{" "}
                {g.opponent}
              </span>
              <span className="font-semibold">
                {g.gf}-{g.ga} ({g.result})
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-1 font-semibold">Season facts ({stats.played} games)</h3>
        <p className="text-zinc-500">
          Scores {stats.goalsFor.toFixed(1)} and concedes {stats.goalsAgainst.toFixed(1)} per game ·
          Over 2.5 goals in {stats.over25}% · Both teams scored in {stats.btts}% · Clean sheets in{" "}
          {stats.cleanSheets}% · Failed to score in {stats.failedToScore}%
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 font-semibold text-green-600">Pros (reasons to back them)</h3>
          <ul className="list-disc pl-5">
            {pros.length ? pros.map((p) => <li key={p}>{p}</li>) : <li>Nothing stands out</li>}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 font-semibold text-red-600">Cons (reasons to be careful)</h3>
          <ul className="list-disc pl-5">
            {cons.length ? cons.map((c) => <li key={c}>{c}</li>) : <li>Nothing stands out</li>}
          </ul>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Estimates from past results using a simple goals model, not guarantees. Corner stats aren&apos;t
        available from the free data source.
      </p>
    </div>
  );
}

export function StandingsTable({
  rows,
  infos,
}: {
  rows: StandingRow[];
  infos: Record<number, TeamInfo>;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

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
        {rows.map((row) => {
          const info = infos[row.team.id];
          const open = openId === row.team.id;
          return (
            <Fragment key={row.team.id}>
              <tr className="border-b">
                <td className="py-2">{row.position}</td>
                <td>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : row.team.id)}
                    className="cursor-pointer text-left font-medium hover:underline"
                  >
                    {row.team.name} {open ? "▾" : "▸"}
                  </button>
                </td>
                <td>{row.playedGames}</td>
                <td>{row.won}</td>
                <td>{row.draw}</td>
                <td>{row.lost}</td>
                <td>{row.goalDifference}</td>
                <td className="font-semibold">{row.points}</td>
                <td>{info && <FormBadges games={info.games} />}</td>
              </tr>
              {open && info && (
                <tr className="border-b">
                  <td colSpan={9} className="py-3">
                    <TeamPanel info={info} teamId={row.team.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
