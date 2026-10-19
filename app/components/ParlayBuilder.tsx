"use client";

import { useState } from "react";
import type { Leg } from "@/lib/odds";

type Pick = Leg;
type Built = { picks: Pick[]; odds: number; chance: number; avgLeg: number; close: boolean };

const TARGETS = [2, 3, 5, 10, 20, 50, 100, 150, 300];

const formatKickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

function risk(chance: number) {
  if (chance >= 0.4) return { label: "Low risk", text: "text-good", bar: "bg-good" };
  if (chance >= 0.15) return { label: "Medium risk", text: "text-warn", bar: "bg-warn" };
  if (chance >= 0.05) return { label: "High risk", text: "text-bad", bar: "bg-bad" };
  return { label: "Very high risk", text: "text-bad", bar: "bg-bad" };
}

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Random search: pick n different matches, then repeatedly swap legs to land on the
// target odds with the safest (highest chance) combination. Keeps the best of many tries.
function build(legs: Leg[], n: number, target: number): Built | string {
  const all: Pick[] = legs;
  const matchIds = [...new Set(all.map((l) => l.matchId))];
  if (matchIds.length < n) {
    return `Only ${matchIds.length} matches in the next 7 days. Choose fewer legs.`;
  }
  const g = Math.log(target) / n; // ideal log-odds per leg
  const byMatch = new Map<string, Pick[]>();
  for (const p of all) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);

  // Lower is better. First priority: land on the target odds. Second: be as safe
  // as possible, meaning the highest chance that every leg hits (the sum of
  // -ln(chance) is smallest when the product of the chances is largest).
  const score = (sel: Pick[]) => {
    const total = sel.reduce((s, p) => s + Math.log(p.odds), 0);
    const risk = sel.reduce((s, p) => s - Math.log(p.prob), 0);
    return Math.abs(total - Math.log(target)) * 15 + risk;
  };

  let best: Pick[] | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 250; attempt++) {
    const ids = shuffle(matchIds).slice(0, n);
    let sel = ids.map((id) => {
      const options = byMatch.get(id)!;
      const want = g + (Math.random() - 0.5) * 0.3;
      return options.reduce((a, b) =>
        Math.abs(Math.log(a.odds) - want) <= Math.abs(Math.log(b.odds) - want) ? a : b,
      );
    });
    for (let pass = 0; pass < 40; pass++) {
      const i = Math.floor(Math.random() * n);
      const used = new Set(sel.filter((_, k) => k !== i).map((p) => p.matchId));
      const candidates = all.filter((p) => !used.has(p.matchId));
      const trial = sel.map((p, k) =>
        k === i ? candidates[Math.floor(Math.random() * candidates.length)] : p,
      );
      // also try the single best fix for this slot
      const others = sel.reduce((s, p, k) => (k === i ? s : s + Math.log(p.odds)), 0);
      const need = Math.log(target) - others;
      const fix = candidates.reduce((a, b) =>
        Math.abs(Math.log(a.odds) - need) <= Math.abs(Math.log(b.odds) - need) ? a : b,
      );
      const fixed = sel.map((p, k) => (k === i ? fix : p));
      for (const option of [fixed, trial]) {
        if (score(option) < score(sel)) sel = option;
      }
    }
    const s = score(sel);
    if (s < bestScore) {
      bestScore = s;
      best = sel;
    }
  }

  const picks = [...best!].sort((a, b) => a.date.localeCompare(b.date));
  const odds = picks.reduce((s, p) => s * p.odds, 1);
  const chance = picks.reduce((s, p) => s * p.prob, 1);
  const avgLeg = picks.reduce((s, p) => s + p.prob, 0) / picks.length;
  return { picks, odds, chance, avgLeg, close: Math.abs(Math.log(odds / target)) <= 0.15 };
}

const field =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function ParlayBuilder({
  legs,
  meta,
}: {
  legs: Leg[];
  meta: { remaining: number | null; updated: string | null };
}) {
  const [count, setCount] = useState(5);
  const [preset, setPreset] = useState("5");
  const [custom, setCustom] = useState("");
  const [includeEstimated, setIncludeEstimated] = useState(false);
  const [result, setResult] = useState<Built | string | null>(null);

  const target = preset === "custom" ? Number(custom) : Number(preset);

  function run() {
    if (!(target > 1)) return setResult("Enter target odds above 1.");
    const pool = includeEstimated ? legs : legs.filter((l) => !l.approx);
    if (pool.length === 0) return setResult("No upcoming matches loaded yet.");
    setResult(build(pool, count, target));
  }

  const built = result && typeof result !== "string" ? result : null;
  const r = built ? risk(built.chance) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-sm font-medium">
            <span className="mb-1.5 block text-muted">Number of games</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={field}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "game" : "games"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            <span className="mb-1.5 block text-muted">Desired total odds</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value)} className={field}>
              {TARGETS.map((t) => (
                <option key={t} value={t}>
                  x{t}
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </label>
          <button
            type="button"
            onClick={run}
            className="h-11 rounded-xl bg-accent px-6 text-sm font-semibold text-white transition active:scale-[.98] hover:opacity-90"
          >
            {built ? "Build another" : "Build parlay"}
          </button>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={includeEstimated}
            onChange={(e) => setIncludeEstimated(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            Include double-chance legs
            <span className="block text-xs text-muted">
              Their prices are estimated from the match-result odds, so they can be a few percent off.
            </span>
          </span>
        </label>
        {preset === "custom" && (
          <label className="mt-4 block max-w-[12rem] text-sm font-medium">
            <span className="mb-1.5 block text-muted">Custom odds</span>
            <input
              type="number"
              inputMode="decimal"
              min="1.1"
              step="0.1"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. 7.5"
              className={field}
            />
          </label>
        )}
      </section>

      {typeof result === "string" && (
        <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{result}</p>
      )}

      {built && r && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className={`text-2xl font-semibold tracking-tight ${r.text}`}>{r.label}</p>
              <p className="text-sm text-muted">
                {built.picks.length} {built.picks.length === 1 ? "leg" : "legs"}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${r.bar}`}
                style={{ width: `${Math.max(2, Math.min(100, built.chance * 100))}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">Estimated chance that every leg hits</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Tile label="Combined odds" value={`x${built.odds.toFixed(2)}`} />
              <Tile label="Chance all hit" value={`${(built.chance * 100).toFixed(1)}%`} />
              <Tile label="Average leg" value={`${(built.avgLeg * 100).toFixed(0)}%`} />
            </div>
            {!built.close && (
              <p className="mt-3 text-sm text-muted">
                Closest I could get to x{target} with this week&apos;s matches.
              </p>
            )}
          </div>

          <ol className="space-y-2">
            {built.picks.map((p, i) => (
              <li
                key={p.matchId}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.pick}
                    {p.approx && <span className="ml-1.5 text-xs font-normal text-muted">≈ estimated</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {p.match} · {p.league} · {formatKickoff(p.date)} UTC
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-semibold tabular-nums">{p.odds.toFixed(2)}</p>
                  <p className="text-[11px] tabular-nums text-muted">
                    {(p.prob * 100).toFixed(0)}% · {p.source}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-muted">
        Odds are real bookmaker prices (mostly Betsson, whose prices track Stake&apos;s closely) from The
        Odds API. Stake itself isn&apos;t available, so always check the final price on Stake before
        betting. &quot;Estimated&quot; double-chance prices are derived from the match-result prices and can
        be a little off. Odds refresh about once a day, so lines may have moved. &quot;Chance all hit&quot; is
        the market&apos;s implied chance with the bookmaker&apos;s margin removed, and parlays still lose
        money over time because the margin multiplies across legs. For information only, not betting
        advice.
        {meta.updated && ` Odds fetched ${meta.updated}.`}
        {meta.remaining !== null && ` Odds API credits left this month: ${meta.remaining}.`}
      </p>
    </div>
  );
}
