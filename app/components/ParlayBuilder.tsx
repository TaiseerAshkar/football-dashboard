"use client";

import { useState } from "react";
import type { Leg } from "@/lib/analysis";

type Pick = Leg & { odds: number };
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
  if (chance >= 0.4) return { label: "Low risk", color: "text-green-600" };
  if (chance >= 0.15) return { label: "Medium risk", color: "text-yellow-600" };
  if (chance >= 0.05) return { label: "High risk", color: "text-orange-600" };
  return { label: "Very high risk", color: "text-red-600" };
}

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Random search: pick n different matches, then repeatedly swap one leg for the
// bet that moves the combined odds closest to the target. Keeps the best of many tries.
function build(legs: Leg[], n: number, target: number): Built | string {
  const all: Pick[] = legs.map((l) => ({ ...l, odds: 1 / l.prob }));
  const matchIds = [...new Set(all.map((l) => l.matchId))];
  if (matchIds.length < n) {
    return `Only ${matchIds.length} matches in the next 7 days. Choose fewer legs.`;
  }
  const g = Math.log(target) / n; // ideal log-odds per leg
  const byMatch = new Map<number, Pick[]>();
  for (const p of all) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);

  const score = (sel: Pick[]) => {
    const total = sel.reduce((s, p) => s + Math.log(p.odds), 0);
    const spread = sel.reduce((s, p) => s + Math.abs(Math.log(p.odds) - g), 0);
    return Math.abs(total - Math.log(target)) * 10 + spread * 0.3;
  };

  let best: Pick[] | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 150; attempt++) {
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
      const trial = sel.map((p, k) => (k === i ? candidates[Math.floor(Math.random() * candidates.length)] : p));
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

export function ParlayBuilder({ legs }: { legs: Leg[] }) {
  const [count, setCount] = useState(5);
  const [preset, setPreset] = useState("5");
  const [custom, setCustom] = useState("");
  const [result, setResult] = useState<Built | string | null>(null);

  const target = preset === "custom" ? Number(custom) : Number(preset);

  function run() {
    if (!(target > 1)) return setResult("Enter target odds above 1.");
    if (legs.length === 0) return setResult("No upcoming matches loaded yet.");
    setResult(build(legs, count, target));
  }

  const selectClass = "rounded border bg-transparent px-2 py-1";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          Number of games (legs)
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className={selectClass}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n} className="text-black">
                {n} {n === 1 ? "game" : "games"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Desired total odds
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className={selectClass}>
            {TARGETS.map((t) => (
              <option key={t} value={t} className="text-black">
                x{t}
              </option>
            ))}
            <option value="custom" className="text-black">
              Custom...
            </option>
          </select>
        </label>
        {preset === "custom" && (
          <label className="flex flex-col gap-1">
            Custom odds
            <input
              type="number"
              min="1.1"
              step="0.1"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className={`${selectClass} w-24`}
            />
          </label>
        )}
        <button
          type="button"
          onClick={run}
          className="rounded-full bg-foreground px-4 py-1.5 text-background"
        >
          {result && typeof result !== "string" ? "Build another" : "Build parlay"}
        </button>
      </div>

      {typeof result === "string" && <p className="text-red-600">{result}</p>}

      {result && typeof result !== "string" && (
        <section className="space-y-3">
          <div className="rounded bg-black/[.04] p-4 dark:bg-white/[.06]">
            <p className={`text-xl font-semibold ${risk(result.chance).color}`}>
              {risk(result.chance).label}
            </p>
            <p className="mt-1 text-sm">
              {result.picks.length} {result.picks.length === 1 ? "leg" : "legs"} · combined odds{" "}
              <b>x{result.odds.toFixed(2)}</b> · estimated chance all hit{" "}
              <b>{(result.chance * 100).toFixed(1)}%</b> · average leg{" "}
              {(result.avgLeg * 100).toFixed(0)}%
            </p>
            {!result.close && (
              <p className="mt-1 text-sm text-zinc-500">
                Closest I could get to x{target} with the matches available this week.
              </p>
            )}
          </div>

          <ul className="text-sm">
            {result.picks.map((p) => (
              <li key={p.matchId} className="border-b py-2">
                <div className="flex flex-wrap justify-between gap-x-4">
                  <span className="font-medium">{p.pick}</span>
                  <span className="font-semibold">
                    {p.odds.toFixed(2)} ({(p.prob * 100).toFixed(0)}%)
                  </span>
                </div>
                <div className="text-zinc-500">
                  {p.match} · {p.league} · {formatKickoff(p.date)} UTC
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Odds shown are the model&apos;s own fair odds (1 divided by its estimated chance), not real
        sportsbook prices. Bookmakers take a margin on every leg, so real odds for the same bets are
        lower. The model is a simple goals estimate and is often wrong. Parlays lose money over time
        because the margin multiplies across legs. For information only, not betting advice.
      </p>
    </div>
  );
}
