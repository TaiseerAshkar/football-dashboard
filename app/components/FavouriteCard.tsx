"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { openSearch, setFavourite, useFavourite } from "@/lib/favourite";
import { loadIndex } from "@/lib/searchIndex";
import { crestUrl, type SearchTeam } from "@/lib/searchTypes";

const COLORS = { W: "bg-good text-white", D: "bg-muted/60 text-white", L: "bg-bad text-white" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// The pinned favourite team at the top of the home page: its form and its next 3
// matches in any competition. With no favourite yet it shows a small invitation.
export function FavouriteCard() {
  const fav = useFavourite();
  const [team, setTeam] = useState<SearchTeam | null | undefined>(undefined);

  useEffect(() => {
    if (!fav) {
      setTeam(undefined);
      return;
    }
    let cancelled = false;
    loadIndex()
      .then((idx) => !cancelled && setTeam(idx.teams.find((t) => t.id === fav.id) ?? null))
      .catch(() => !cancelled && setTeam(null));
    return () => {
      cancelled = true;
    };
  }, [fav]);

  if (!fav) {
    return (
      <button
        type="button"
        onClick={openSearch}
        className="fade-up flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-line bg-surface/60 px-4 py-3 text-left text-sm text-muted transition-colors hover:border-accent/60 hover:text-foreground"
      >
        <span>
          <span className="mr-2 text-base text-amber-400">☆</span>
          Pin your favourite team to the top of this page
        </span>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium">Search</span>
      </button>
    );
  }

  return (
    <section aria-label="Your team" className="fade-up relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white p-1.5 shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={crestUrl(fav.id)}
            alt=""
            width={36}
            height={36}
            className="h-full w-full object-contain"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-500">★ Your team</p>
          <h2 className="truncate text-lg font-bold tracking-tight sm:text-xl">{team?.name ?? fav.name}</h2>
          <p className="truncate text-xs text-muted">{team?.leagueName ?? ""}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={openSearch} className="rounded-lg px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-surface-2">
            Change
          </button>
          <button
            type="button"
            onClick={() => setFavourite(null)}
            aria-label="Remove favourite team"
            title="Remove"
            className="rounded-lg px-2 py-1 text-muted transition-colors hover:bg-surface-2 hover:text-bad"
          >
            ✕
          </button>
        </div>
      </div>

      {team === undefined && <div className="shimmer relative mt-4 h-16 rounded-xl" />}
      {team === null && <p className="relative mt-3 text-sm text-muted">No fixtures found for this team right now.</p>}
      {team && (
        <div className="relative mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-8">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Form</p>
            <span className="inline-flex gap-1" aria-label={`Form: ${team.form.join(" ")}`}>
              {[...team.form].reverse().map((r, i) => (
                <span key={i} className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold shadow-sm ring-1 ring-black/10 dark:ring-white/10 ${COLORS[r]}`}>
                  {r}
                </span>
              ))}
            </span>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Next 3 matches</p>
            {team.next.length === 0 ? (
              <p className="text-sm text-muted">No upcoming matches found.</p>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-3">
                {team.next.map((n) => (
                  <li key={n.date + n.opponent} className="rounded-xl bg-surface-2 px-3 py-2">
                    <p className="truncate text-sm font-semibold">
                      {n.home ? "vs" : "@"} {n.opponent}
                    </p>
                    <p className="truncate text-xs text-muted">{n.competition}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted">{when(n.date)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {team && (
        <Link href={`/team/${team.league}/${team.id}`} className="relative mt-3 inline-block text-sm font-medium text-accent hover:underline">
          Full team stats →
        </Link>
      )}
    </section>
  );
}
