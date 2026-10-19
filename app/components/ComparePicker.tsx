"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: number; name: string };

const select =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent";

// Picks the league and the two teams. Every change goes into the page address,
// so a comparison can be copied and sent to a friend.
export function ComparePicker({
  league,
  leagues,
  teams,
  a,
  b,
}: {
  league: string;
  leagues: { code: string; name: string }[];
  teams: Option[];
  a: number;
  b: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const go = (l: string, x?: number, y?: number) =>
    router.push(`/compare?league=${l}${x ? `&a=${x}` : ""}${y ? `&b=${y}` : ""}`);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", window.location.href);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[1fr_1fr_auto_1fr] sm:items-end">
      <label className="block text-sm font-medium">
        <span className="mb-1.5 block text-muted">League</span>
        <select value={league} onChange={(e) => go(e.target.value)} className={select}>
          {leagues.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        <span className="mb-1.5 block text-accent">Team A</span>
        <select value={a} onChange={(e) => go(league, Number(e.target.value), b)} className={select}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => go(league, b, a)}
        aria-label="Swap the two teams"
        title="Swap sides"
        className="grid h-11 w-full place-items-center rounded-xl border border-line bg-surface-2 text-muted transition hover:border-accent hover:text-accent sm:w-11"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M16 3l4 4-4 4" />
          <path d="M20 7H8" />
          <path d="M8 21l-4-4 4-4" />
          <path d="M4 17h12" />
        </svg>
      </button>
      <label className="block text-sm font-medium">
        <span className="mb-1.5 block text-info">Team B</span>
        <select value={b} onChange={(e) => go(league, a, Number(e.target.value))} className={select}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={copy}
        className="h-10 rounded-xl border border-line bg-surface px-4 text-sm font-semibold transition hover:border-accent hover:text-accent sm:col-span-4 sm:w-fit"
      >
        {copied ? "✓ Link copied" : "Copy link to this comparison"}
      </button>
    </div>
  );
}
