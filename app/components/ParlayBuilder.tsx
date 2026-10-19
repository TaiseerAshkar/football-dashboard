"use client";

import { useEffect, useState } from "react";
import type { Leg } from "@/lib/odds";

type Built = { picks: Leg[]; odds: number; chance: number; avgLeg: number; close: boolean };

const TARGETS = [2, 3, 5, 10, 20, 50, 100, 150, 300];
const OPTIONS = 3;

// Kick-off in the viewer's own time zone (this only renders after a click, so
// there is no server/browser mismatch).
const formatKickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

// yyyy-mm-dd in the viewer's local time zone, for the date inputs.
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

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
// target odds with the safest (highest chance) combination. Runs many tries and
// returns the best few different combinations (they may share games).
function build(legs: Leg[], n: number, target: number): Built[] | string {
  const matchIds = [...new Set(legs.map((l) => l.matchId))];
  if (matchIds.length < n) {
    return `Only ${matchIds.length} ${matchIds.length === 1 ? "match" : "matches"} in that date range. Choose fewer games or widen the dates.`;
  }
  const g = Math.log(target) / n; // ideal log-odds per leg
  const byMatch = new Map<string, Leg[]>();
  for (const p of legs) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);

  // Lower is better. First priority: land on the target odds. Second: be as safe
  // as possible, meaning the highest chance that every leg hits (the sum of
  // -ln(chance) is smallest when the product of the chances is largest).
  const score = (sel: Leg[]) => {
    const total = sel.reduce((s, p) => s + Math.log(p.odds), 0);
    const risky = sel.reduce((s, p) => s - Math.log(p.prob), 0);
    return Math.abs(total - Math.log(target)) * 15 + risky;
  };

  const found = new Map<string, { sel: Leg[]; score: number }>();
  for (let attempt = 0; attempt < 300; attempt++) {
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
      const candidates = legs.filter((p) => !used.has(p.matchId));
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
    const key = sel
      .map((p) => `${p.matchId}:${p.pick}`)
      .sort()
      .join("|");
    const s = score(sel);
    if (!found.has(key) || found.get(key)!.score > s) found.set(key, { sel, score: s });
  }

  return [...found.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, OPTIONS)
    .map(({ sel }) => {
      const picks = [...sel].sort((a, b) => a.date.localeCompare(b.date));
      const odds = picks.reduce((s, p) => s * p.odds, 1);
      const chance = picks.reduce((s, p) => s * p.prob, 1);
      const avgLeg = picks.reduce((s, p) => s + p.prob, 0) / picks.length;
      return { picks, odds, chance, avgLeg, close: Math.abs(Math.log(odds / target)) <= 0.15 };
    });
}

const field =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <div className="text-[11px] leading-tight text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function OptionCard({ built, index, target }: { built: Built; index: number; target: number }) {
  const r = risk(built.chance);
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Option {index + 1}
          {index === 0 && <span className="ml-1.5 normal-case text-accent">· safest</span>}
        </span>
        <span className={`text-sm font-semibold ${r.text}`}>{r.label}</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${r.bar}`}
          style={{ width: `${Math.max(2, Math.min(100, built.chance * 100))}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile label="Total odds" value={`x${built.odds.toFixed(2)}`} />
        <Tile label="All hit" value={`${(built.chance * 100).toFixed(1)}%`} />
        <Tile label="Avg leg" value={`${(built.avgLeg * 100).toFixed(0)}%`} />
      </div>
      {!built.close && (
        <p className="mt-2 text-xs text-muted">Closest I could get to x{target} in this date range.</p>
      )}

      <ol className="mt-3 divide-y divide-line text-sm">
        {built.picks.map((p, i) => (
          <li key={`${p.matchId}-${p.pick}`} className="flex items-start gap-2.5 py-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">
                {p.pick}
                {p.approx && <span className="ml-1.5 text-xs font-normal text-muted">≈ estimated</span>}
              </p>
              <p className="text-xs leading-snug text-muted">
                {p.match} · {p.league} · {formatKickoff(p.date)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">{p.odds.toFixed(2)}</p>
              <p className="text-[11px] tabular-nums text-muted">{(p.prob * 100).toFixed(0)}%</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

const chip =
  "rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground";

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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [results, setResults] = useState<Built[] | string | null>(null);

  // Default range: today to a week from now (set after load so the server and
  // browser, which can be in different time zones, never disagree).
  useEffect(() => {
    const today = new Date();
    setFrom(localDate(today));
    setTo(localDate(addDays(today, 6)));
  }, []);

  const target = preset === "custom" ? Number(custom) : Number(preset);

  function setRange(days: number) {
    const today = new Date();
    setFrom(localDate(today));
    setTo(localDate(addDays(today, days)));
  }

  function run() {
    if (!(target > 1)) return setResults("Enter target odds above 1.");
    if (!from || !to || from > to) return setResults("Choose a start date that is on or before the end date.");
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T23:59:59.999`).getTime();
    const now = Date.now();
    const pool = legs.filter((l) => {
      const t = new Date(l.date).getTime();
      return t > now && t >= start && t <= end && (includeEstimated || !l.approx);
    });
    setResults(pool.length === 0 ? "No matches in that date range." : build(pool, count, target));
  }

  const built = results && typeof results !== "string" ? results : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <label className="block text-sm font-medium">
            <span className="mb-1.5 block text-muted">From date</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-medium">
            <span className="mb-1.5 block text-muted">To date</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
        </div>

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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Quick dates:</span>
          <button type="button" onClick={() => setRange(0)} className={chip}>
            Today
          </button>
          <button type="button" onClick={() => setRange(1)} className={chip}>
            Today + tomorrow
          </button>
          <button type="button" onClick={() => setRange(2)} className={chip}>
            Next 3 days
          </button>
          <button type="button" onClick={() => setRange(6)} className={chip}>
            Next 7 days
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

        <button
          type="button"
          onClick={run}
          className="mt-5 h-11 w-full rounded-xl bg-accent px-6 text-sm font-semibold text-white transition active:scale-[.98] hover:opacity-90 sm:w-auto"
        >
          {built ? "Rebuild options" : "Build 3 options"}
        </button>
      </section>

      {typeof results === "string" && (
        <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{results}</p>
      )}

      {built && (
        <div className="space-y-3">
          <div className="grid gap-4 lg:grid-cols-3">
            {built.map((b, i) => (
              <OptionCard key={i} built={b} index={i} target={target} />
            ))}
          </div>
          {built.length < OPTIONS && (
            <p className="text-sm text-muted">
              Only {built.length} {built.length === 1 ? "combination fits" : "combinations fit"} these settings.
              Widen the dates or choose fewer games for more options.
            </p>
          )}
        </div>
      )}

      <p className="rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-muted">
        Odds are real bookmaker prices (mostly Betsson, whose prices track Stake&apos;s closely) from The
        Odds API. Stake itself isn&apos;t available, so always check the final price on Stake before
        betting. The options can share games. &quot;Estimated&quot; double-chance prices are derived from the
        match-result prices and can be a little off. Odds refresh about once a day, so lines may have
        moved. &quot;All hit&quot; is the market&apos;s implied chance with the bookmaker&apos;s margin removed, and
        parlays still lose money over time because the margin multiplies across legs. Times are shown in
        your own time zone. For information only, not betting advice.
        {meta.updated && ` Odds fetched ${meta.updated}.`}
        {meta.remaining !== null && ` Odds API credits left this month: ${meta.remaining}.`}
      </p>
    </div>
  );
}
