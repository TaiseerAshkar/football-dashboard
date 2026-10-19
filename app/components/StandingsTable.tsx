"use client";

import { Fragment, useState } from "react";
import { FormBadges } from "@/app/components/FormBadges";
import type { TeamInfo } from "@/lib/analysis";
import type { StandingRow } from "@/lib/standings";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function TeamPanel({ info }: { info: TeamInfo }) {
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
                {g.home ? "vs" : "@"} {g.opponent}
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
                    <TeamPanel info={info} />
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
