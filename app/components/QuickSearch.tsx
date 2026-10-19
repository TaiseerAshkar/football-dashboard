"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toggleFavourite, useFavourites } from "@/lib/favourite";
import { LEAGUES } from "@/lib/leagues";
import { loadIndex } from "@/lib/searchIndex";
import { crestUrl, type SearchIndex, type SearchTeam } from "@/lib/searchTypes";

const PAGES = [
  { href: "/", label: "Tables", hint: "League tables, stories and fixtures" },
  { href: "/compare", label: "Compare teams", hint: "Two clubs side by side" },
  { href: "/parlay", label: "Parlay builder", hint: "Build a bet slip from real odds" },
];

type Item =
  | { kind: "team"; team: SearchTeam }
  | { kind: "league"; code: string; name: string }
  | { kind: "page"; href: string; label: string; hint: string };

// lower-case, no accents, so "atletico" finds "Atlético"
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// every word typed must start some word of the club's name
function matches(team: SearchTeam, query: string) {
  const words = norm(`${team.name} ${team.full}`).split(/[^a-z0-9]+/).filter(Boolean);
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((q) => words.some((w) => w.startsWith(q)));
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Crest({ id }: { id: number }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white p-1 shadow-sm ring-1 ring-black/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={crestUrl(id)}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        className="h-full w-full object-contain"
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
      />
    </span>
  );
}

export function QuickSearch() {
  const router = useRouter();
  const favs = useFavourites();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setExpanded(null);
    setActive(0);
    returnFocus.current?.focus?.();
  }, []);

  // open with Ctrl/Cmd+K or "/", or when another part of the page asks for it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-search", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-search", show);
    };
  }, [open, show]);

  // load the team list the first time the box opens, and keep the page still behind it
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    if (!index) loadIndex().then(setIndex).catch(() => setError(true));
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, index]);

  const q = norm(query.trim());
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (q === "") {
      for (const f of favs) {
        const mine = index?.teams.find((t) => t.id === f.id);
        if (mine) out.push({ kind: "team", team: mine });
      }
      LEAGUES.forEach((l) => out.push({ kind: "league", code: l.code, name: l.name }));
      PAGES.forEach((p) => out.push({ kind: "page", ...p }));
      return out;
    }
    const teams = (index?.teams ?? [])
      .filter((t) => matches(t, q))
      .sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 8);
    teams.forEach((team) => out.push({ kind: "team", team }));
    LEAGUES.filter((l) => norm(l.name).includes(q)).forEach((l) => out.push({ kind: "league", code: l.code, name: l.name }));
    PAGES.filter((p) => norm(p.label).includes(q)).forEach((p) => out.push({ kind: "page", ...p }));
    return out;
  }, [q, index, favs]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(href: string) {
    close();
    router.push(href);
  }

  function choose(item: Item) {
    if (item.kind === "team") setExpanded((e) => (e === item.team.id ? null : item.team.id));
    else if (item.kind === "league") go(`/?league=${item.code}`);
    else go(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      choose(items[active]);
    }
  }

  const heading = (text: string) => (
    <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{text}</p>
  );
  let lastKind: Item["kind"] | null = null;
  const sectionTitle = (item: Item) => {
    if (item.kind === lastKind) return null;
    lastKind = item.kind;
    if (item.kind === "team") return heading(q === "" ? "Your team" : "Teams");
    return heading(item.kind === "league" ? "Leagues" : "Pages");
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="Search teams, leagues and pages"
        className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden md:inline">Search</span>
        <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium md:inline">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={close} />
          <div
            onKeyDown={onKeyDown}
            className="fade-up relative mx-auto mt-3 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:mt-[10vh] sm:max-h-[75vh]"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a team, league or page..."
                aria-label="Search"
                autoComplete="off"
                className="h-14 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted"
              />
              <button type="button" onClick={close} className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted hover:text-foreground">
                Esc
              </button>
            </div>

            <div ref={listRef} className="overflow-y-auto pb-2">
              {error && <p className="px-4 py-6 text-center text-sm text-bad">Could not load the teams. Try again in a moment.</p>}
              {!error && !index && q !== "" && <p className="px-4 py-6 text-center text-sm text-muted">Loading teams...</p>}
              {!error && index && q !== "" && items.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted">Nothing found for &quot;{query}&quot;.</p>
              )}

              {items.map((item, i) => {
                const title = sectionTitle(item);
                const isActive = i === active;
                const base = `flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-accent-soft" : "hover:bg-surface-2"}`;

                if (item.kind === "team") {
                  const t = item.team;
                  const isOpen = expanded === t.id;
                  const isFav = favs.some((f) => f.id === t.id);
                  return (
                    <div key={`t${t.id}`}>
                      {title}
                      <div data-index={i} className={`flex items-center ${isActive ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
                        <button type="button" onClick={() => choose(item)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left">
                          <Crest id={t.id} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{t.name}</span>
                            <span className="block truncate text-xs text-muted">{t.leagueName}</span>
                          </span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFavourite({ id: t.id, name: t.name })}
                          aria-pressed={isFav}
                          aria-label={isFav ? `Remove ${t.name} as favourite` : `Add ${t.name} to your favourites`}
                          title={isFav ? "One of your favourite teams" : "Add to favourites"}
                          className={`mr-3 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg transition-colors ${isFav ? "text-amber-400" : "text-muted hover:text-amber-400"}`}
                        >
                          {isFav ? "★" : "☆"}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="bg-surface-2/50 px-4 pb-3 pt-2">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Next matches</p>
                          {t.next.length === 0 ? (
                            <p className="text-sm text-muted">No upcoming matches found.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {t.next.map((n) => (
                                <li key={n.date + n.opponent} className="flex items-start justify-between gap-3 text-sm">
                                  <span className="min-w-0">
                                    <span className="font-medium">
                                      {n.home ? "vs" : "@"} {n.opponent}
                                    </span>
                                    <span className="block text-xs text-muted">{n.competition}</span>
                                  </span>
                                  <span className="shrink-0 text-right text-xs text-muted">{when(n.date)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <Link href={`/team/${t.league}/${t.id}`} onClick={close} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                            Open {t.name} →
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                }

                const label = item.kind === "league" ? item.name : item.label;
                const hint = item.kind === "league" ? "League table" : item.hint;
                return (
                  <div key={item.kind + label}>
                    {title}
                    <button type="button" data-index={i} onClick={() => choose(item)} className={base}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-sm">{item.kind === "league" ? "🏆" : "↗"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{label}</span>
                        <span className="block truncate text-xs text-muted">{hint}</span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-muted sm:flex">
              <span>↑↓ to move</span>
              <span>Enter to open</span>
              <span>☆ to pin your team</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
