"use client";

import { useEffect, useState } from "react";
import { loadExtraOdds } from "@/app/parlay/actions";
import { explain, type TeamForm } from "@/lib/explain";
import {
  loadSaved,
  newId,
  signature,
  storeSaved,
  type SavedParlay,
  type SavedStatus,
} from "@/lib/saved";
import type { ExtraMarket, ExtraRequest, Leg, LegKind } from "@/lib/odds";

type Built = {
  picks: Leg[];
  odds: number;
  chance: number;
  avgLeg: number;
  close: boolean;
  name: string;
  blurb: string;
};

const TARGETS = [2, 3, 5, 10, 20, 50, 100, 150, 300];
// Extra prices cost 1 credit per match, so only the most promising matches get them.
const CAP_PER_MARKET = 15;

// Same list as in lib/odds.ts (that file is server-only, so it is repeated here).
const PLAYER_SPORTS = [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
];

const KIND_MARKET: Partial<Record<LegKind, ExtraMarket>> = {
  dc: "double_chance",
  btts: "btts",
  lines: "alternate_totals",
  player: "player",
};

const TYPES: { kind: LegKind; label: string; hint: string; credits?: boolean }[] = [
  { kind: "result", label: "Match result", hint: "Win or draw" },
  { kind: "goals", label: "Over/under goals", hint: "Main line, usually 2.5" },
  { kind: "dc", label: "Double chance", hint: "Team or draw", credits: true },
  { kind: "btts", label: "Both teams to score", hint: "Yes or no", credits: true },
  { kind: "lines", label: "More goal lines", hint: "Over 1.5, 3.5 and more", credits: true },
  { kind: "player", label: "Player to score", hint: "US bookmaker prices, 5 leagues only", credits: true },
];

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

// Random search: pick n different matches, then repeatedly swap legs to lower the
// score (which always includes landing on the target odds). Keeps the best of
// many tries. Legs cheaper than `minOdds` are ignored, so a strategy can refuse
// to pad the parlay with near-certain 1.02 legs.
function search(
  legs: Leg[],
  n: number,
  target: number,
  minOdds: number,
  score: (sel: Leg[]) => number,
): Leg[] | null {
  let pool = legs.filter((l) => l.odds >= minOdds);
  if (new Set(pool.map((l) => l.matchId)).size < n) pool = legs; // too few matches: relax the minimum
  const matchIds = [...new Set(pool.map((l) => l.matchId))];
  if (matchIds.length < n) return null;

  const g = Math.log(target) / n; // ideal log-odds per leg
  const byMatch = new Map<string, Leg[]>();
  for (const p of pool) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);

  let best: Leg[] | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 200; attempt++) {
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
      const candidates = pool.filter((p) => !used.has(p.matchId));
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
  return best;
}

const logSum = (sel: Leg[]) => sel.reduce((s, p) => s + Math.log(p.odds), 0);
const riskOf = (sel: Leg[]) => sel.reduce((s, p) => s - Math.log(p.prob), 0); // lower = safer

// Three genuinely different ideas for the same games and total odds.
function build(legs: Leg[], n: number, target: number): Built[] | string {
  const matchCount = new Set(legs.map((l) => l.matchId)).size;
  if (matchCount < n) {
    return `Only ${matchCount} ${matchCount === 1 ? "match" : "matches"} with the chosen bet types in that date range. Choose fewer games, more bet types, or widen the dates.`;
  }
  const g = Math.log(target) / n;
  const delta = (sel: Leg[]) => Math.abs(logSum(sel) - Math.log(target)) * 15;
  const spread = (sel: Leg[]) => sel.reduce((s, p) => s + Math.abs(Math.log(p.odds) - g), 0);
  const keys = (sel: Leg[]) => sel.map((p) => `${p.matchId}:${p.pick}`);

  const plans: {
    name: string;
    blurb: string;
    minOdds: number;
    score: (sel: Leg[], taken: Set<string>, takenMatches: Set<string>) => number;
  }[] = [
    {
      name: "Safest",
      blurb: "Highest chance that every leg hits, with no throwaway 1.0x legs.",
      minOdds: 1.12,
      score: (sel) => delta(sel) + riskOf(sel),
    },
    {
      name: "Balanced",
      blurb: "Every leg at a similar price, no padding.",
      minOdds: 1.12,
      score: (sel, taken) =>
        delta(sel) + spread(sel) * 1.2 + riskOf(sel) * 0.3 + keys(sel).filter((k) => taken.has(k)).length * 0.4,
    },
    {
      name: "Varied",
      blurb: "Mixes different bet types, on different matches.",
      minOdds: 1.1,
      score: (sel, taken, takenMatches) =>
        delta(sel) +
        riskOf(sel) * 0.5 +
        (n - new Set(sel.map((p) => p.kind)).size) * 0.4 +
        sel.filter((p) => takenMatches.has(p.matchId)).length * 0.35 +
        keys(sel).filter((k) => taken.has(k)).length * 0.4,
    },
  ];

  const out: Built[] = [];
  const taken = new Set<string>();
  const takenMatches = new Set<string>();
  for (const plan of plans) {
    const sel = search(legs, n, target, plan.minOdds, (s) => plan.score(s, taken, takenMatches));
    if (!sel) continue;
    keys(sel).forEach((k) => taken.add(k));
    sel.forEach((p) => takenMatches.add(p.matchId));
    const picks = [...sel].sort((a, b) => a.date.localeCompare(b.date));
    const odds = picks.reduce((s, p) => s * p.odds, 1);
    const chance = picks.reduce((s, p) => s * p.prob, 1);
    const avgLeg = picks.reduce((s, p) => s + p.prob, 0) / picks.length;
    out.push({
      picks,
      odds,
      chance,
      avgLeg,
      close: Math.abs(Math.log(odds / target)) <= 0.15,
      name: plan.name,
      blurb: plan.blurb,
    });
  }
  return out.length ? out : "Could not build options from these matches.";
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

function OptionCard({
  built,
  index,
  target,
  formIndex,
  saved,
  onSave,
}: {
  built: Built;
  index: number;
  target: number;
  formIndex: TeamForm[];
  saved: boolean;
  onSave: () => void;
}) {
  const r = risk(built.chance);
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Option {index + 1}
          <span className="ml-1.5 normal-case text-accent">· {built.name}</span>
        </span>
        <span className={`text-sm font-semibold ${r.text}`}>{r.label}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{built.blurb}</p>

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
        <p className="mt-2 text-xs text-muted">Closest I could get to x{target} with these settings.</p>
      )}

      <ol className="mt-3 divide-y divide-line text-sm">
        {built.picks.map((p, i) => (
          <li key={`${p.matchId}-${p.pick}`} className="py-2.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">
                  {p.pick}
                  {p.note && <span className="ml-1.5 text-xs font-normal text-warn">{p.note}</span>}
                </p>
                <p className="text-xs leading-snug text-muted">
                  {p.match} · {p.league} · {formatKickoff(p.date)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">{p.odds.toFixed(2)}</p>
                <p className="text-[11px] tabular-nums text-muted">
                  {(p.prob * 100).toFixed(0)}% · {p.source}
                </p>
              </div>
            </div>
            <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11.5px] leading-snug">
              <span className="font-semibold text-accent">Why: </span>
              {explain(p, formIndex)}
            </p>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onSave}
        disabled={saved}
        className={`mt-3 h-10 w-full rounded-xl border text-sm font-semibold transition ${
          saved
            ? "border-accent bg-accent-soft text-accent"
            : "border-line bg-surface hover:border-accent hover:text-accent"
        }`}
      >
        {saved ? "✓ Saved" : "Save this parlay"}
      </button>
    </article>
  );
}

const STATUS_LABEL: Record<SavedStatus, string> = { pending: "Pending", won: "Won", lost: "Lost" };
const STATUS_STYLE: Record<SavedStatus, string> = {
  pending: "border-accent bg-accent-soft text-accent",
  won: "border-good bg-good/15 text-good",
  lost: "border-bad bg-bad/15 text-bad",
};

function SavedList({
  list,
  onStatus,
  onRemove,
}: {
  list: SavedParlay[];
  onStatus: (id: string, status: SavedStatus) => void;
  onRemove: (id: string) => void;
}) {
  if (list.length === 0) return null;
  const won = list.filter((p) => p.status === "won").length;
  const lost = list.filter((p) => p.status === "lost").length;
  const pending = list.length - won - lost;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Saved parlays</h2>
        <p className="text-sm text-muted">
          <b className="text-good">{won} won</b> · <b className="text-bad">{lost} lost</b> · {pending} pending. Saved
          in this browser only.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {list.map((p) => (
          <article key={p.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  x{p.odds.toFixed(2)} · {p.picks.length} {p.picks.length === 1 ? "leg" : "legs"}
                </p>
                <p className="text-xs text-muted">
                  {p.plan} · {(p.chance * 100).toFixed(1)}% to hit · saved{" "}
                  {new Date(p.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                aria-label="Delete saved parlay"
                title="Delete"
                className="rounded-lg px-2 py-1 text-muted transition-colors hover:bg-surface-2 hover:text-bad"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex gap-1.5" role="group" aria-label="Result">
              {(Object.keys(STATUS_LABEL) as SavedStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  aria-pressed={p.status === st}
                  onClick={() => onStatus(p.id, st)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    p.status === st ? STATUS_STYLE[st] : "border-line text-muted hover:text-foreground"
                  }`}
                >
                  {STATUS_LABEL[st]}
                </button>
              ))}
            </div>

            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-accent">Show legs</summary>
              <ol className="mt-2 divide-y divide-line">
                {p.picks.map((leg, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{leg.pick}</p>
                      <p className="text-xs leading-snug text-muted">
                        {leg.match} · {leg.league} · {formatKickoff(leg.date)}
                      </p>
                    </div>
                    <b className="shrink-0 tabular-nums">{leg.odds.toFixed(2)}</b>
                  </li>
                ))}
              </ol>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

const chip =
  "rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground";

export function ParlayBuilder({
  legs,
  formIndex,
  meta,
}: {
  legs: Leg[];
  formIndex: TeamForm[];
  meta: { remaining: number | null; updated: string | null };
}) {
  const [count, setCount] = useState(5);
  const [preset, setPreset] = useState("5");
  const [custom, setCustom] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [types, setTypes] = useState<Record<LegKind, boolean>>({
    result: true,
    goals: true,
    dc: false,
    btts: false,
    lines: false,
    player: false,
  });
  const [extraLegs, setExtraLegs] = useState<Leg[]>([]);
  const [fetched, setFetched] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number | null>(meta.remaining);
  const [confirm, setConfirm] = useState<ExtraRequest[] | null>(null);
  const [confirmNote, setConfirmNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<Built[] | string | null>(null);
  const [saved, setSaved] = useState<SavedParlay[]>([]);

  // Default range: today to a week from now (set after load so the server and
  // browser, which can be in different time zones, never disagree).
  useEffect(() => {
    const today = new Date();
    setFrom(localDate(today));
    setTo(localDate(addDays(today, 6)));
    setSaved(loadSaved()); // saved parlays live in this browser only
  }, []);

  // Always works from the latest list, so quick successive clicks never lose a save.
  function updateSaved(change: (prev: SavedParlay[]) => SavedParlay[]) {
    setSaved((prev) => {
      const next = change(prev);
      storeSaved(next);
      return next;
    });
  }

  function saveBuilt(b: Built) {
    const sig = signature(b.picks);
    updateSaved((prev) => {
      if (prev.some((p) => signature(p.picks) === sig)) return prev;
      return [
      {
        id: newId(),
        savedAt: new Date().toISOString(),
        plan: b.name,
        odds: b.odds,
        chance: b.chance,
        status: "pending",
        picks: b.picks.map((p) => ({
          pick: p.pick,
          match: p.match,
          league: p.league,
          date: p.date,
          odds: p.odds,
          prob: p.prob,
          source: p.source,
        })),
      },
      ...prev,
      ];
    });
  }

  const target = preset === "custom" ? Number(custom) : Number(preset);

  function setRange(days: number) {
    const today = new Date();
    setFrom(localDate(today));
    setTo(localDate(addDays(today, days)));
  }

  function toggle(kind: LegKind) {
    setTypes((t) => ({ ...t, [kind]: !t[kind] }));
    setConfirm(null);
  }

  const inRange = () => {
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T23:59:59.999`).getTime();
    const now = Date.now();
    return (l: Leg) => {
      const t = new Date(l.date).getTime();
      return t > now && t >= start && t <= end;
    };
  };

  function buildNow(extra: Leg[]) {
    const ok = inRange();
    const seen = new Set<string>();
    const pool: Leg[] = [];
    for (const l of [...legs, ...extra]) {
      const key = `${l.matchId}|${l.pick}`;
      if (!types[l.kind] || !ok(l) || seen.has(key)) continue;
      seen.add(key);
      pool.push(l);
    }
    setResults(pool.length === 0 ? "No matches with those bet types in that date range." : build(pool, count, target));
  }

  function run() {
    setNotice(null);
    setConfirm(null);
    if (!(target > 1)) return setResults("Enter target odds above 1.");
    if (!from || !to || from > to) return setResults("Choose a start date that is on or before the end date.");
    if (!Object.values(types).some(Boolean)) return setResults("Choose at least one bet type.");

    // Which extra odds are still missing? To save credits, only the most promising
    // matches get them: for double chance and players the ones with the strongest
    // favourite, for goals-based bets the ones where the over/under is most one-sided.
    const ok = inRange();
    const info = new Map<string, { sport: string; fav: number; skew: number }>();
    for (const l of legs) {
      if (!ok(l)) continue;
      const e = info.get(l.matchId) ?? { sport: l.sport, fav: 0, skew: 0 };
      if (l.kind === "result" && l.pick.endsWith("to win")) e.fav = Math.max(e.fav, l.prob);
      if (l.kind === "goals" && l.pick.startsWith("Over ") && Math.abs(Number(l.pick.split(" ")[1]) - 2.5) < 0.01) {
        e.skew = Math.abs(l.prob - 0.5);
      }
      info.set(l.matchId, e);
    }
    const markets = (Object.keys(KIND_MARKET) as LegKind[]).filter((k) => types[k]).map((k) => KIND_MARKET[k]!);
    const pairs: ExtraRequest[] = [];
    let trimmed = false;
    for (const market of markets) {
      const byFavourite = market === "double_chance" || market === "player";
      const ranked = [...info.entries()]
        .filter(([, e]) => market !== "player" || PLAYER_SPORTS.includes(e.sport))
        .sort((x, y) => (byFavourite ? y[1].fav - x[1].fav : y[1].skew - x[1].skew));
      if (ranked.length > CAP_PER_MARKET) trimmed = true;
      for (const [id, e] of ranked.slice(0, CAP_PER_MARKET)) {
        if (!fetched.has(`${id}:${market}`)) pairs.push({ id, sport: e.sport, market });
      }
    }
    setConfirmNote(
      trimmed ? `${info.size} matches are in range, so I'll fetch extra prices for the ${CAP_PER_MARKET} most promising per bet type to save credits.` : null,
    );

    if (pairs.length === 0) return buildNow(extraLegs);
    if (pairs.length > 60) {
      return setResults(
        `Those extra bet types would need ${pairs.length} credits for this date range (the limit is 60 at a time). Narrow the dates or choose fewer extra bet types.`,
      );
    }
    setConfirm(pairs);
  }

  async function confirmFetch() {
    if (!confirm) return;
    setLoading(true);
    try {
      const res = await loadExtraOdds(confirm);
      if (res.remaining !== null && res.remaining !== undefined) setRemaining(res.remaining);
      if ("blocked" in res && res.blocked) {
        setResults(res.blocked);
      } else {
        const merged = [...extraLegs, ...res.legs];
        setExtraLegs(merged);
        setFetched((prev) => new Set([...prev, ...res.done.map((d) => `${d.id}:${d.market}`)]));
        if (res.done.length < confirm.length) {
          setNotice(
            `Fetched ${res.done.length} of ${confirm.length} extra prices. Some were unavailable or held back to protect your monthly credits.`,
          );
        }
        buildNow(merged);
      }
    } catch {
      setResults("Could not load the extra odds. Try again in a moment.");
    }
    setConfirm(null);
    setLoading(false);
  }

  const built = results && typeof results !== "string" ? results : null;
  const confirmMatches = confirm ? new Set(confirm.map((c) => c.id)).size : 0;

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

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-muted">Bet types to use</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const on = types[t.kind];
              return (
                <button
                  key={t.kind}
                  type="button"
                  aria-pressed={on}
                  title={t.hint}
                  onClick={() => toggle(t.kind)}
                  className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                    on
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {on && "✓ "}
                  {t.label}
                  {t.credits && <span className="ml-1.5 text-[10px] font-normal opacity-70">uses credits</span>}
                </button>
              );
            })}
            <span
              title="The odds provider has no corner prices for these leagues"
              className="cursor-not-allowed rounded-full border border-dashed border-line px-3.5 py-2 text-sm text-muted opacity-60"
            >
              Corners · not available
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Match result and goals are free. The others fetch extra prices, 1 credit per match per bet type, and ask
            you first. They&apos;re saved for a day.
          </p>
        </fieldset>

        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="mt-5 h-11 w-full rounded-xl bg-accent px-6 text-sm font-semibold text-white transition active:scale-[.98] hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          {loading ? "Fetching odds..." : built ? "Rebuild options" : "Build 3 options"}
        </button>
      </section>

      {confirm && (
        <div className="rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <p>
            Getting these extra prices for <b>{confirmMatches}</b> {confirmMatches === 1 ? "match" : "matches"} will
            use up to <b>{confirm.length}</b> of your monthly odds credits. They&apos;re saved for a day, so
            building again with the same matches is free.
          </p>
          {confirmNote && <p className="mt-2 text-muted">{confirmNote}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmFetch}
              disabled={loading}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              Use {confirm.length} credits and build
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">{notice}</p>}

      {typeof results === "string" && (
        <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{results}</p>
      )}

      {built && (
        <div className="space-y-3">
          <div className="grid gap-4 lg:grid-cols-3">
            {built.map((b, i) => (
              <OptionCard
                key={i}
                built={b}
                index={i}
                target={target}
                formIndex={formIndex}
                saved={saved.some((p) => signature(p.picks) === signature(b.picks))}
                onSave={() => saveBuilt(b)}
              />
            ))}
          </div>
          {built.length < 3 && (
            <p className="text-sm text-muted">
              Only {built.length} {built.length === 1 ? "combination fits" : "combinations fit"} these settings.
              Widen the dates, add bet types or choose fewer games for more options.
            </p>
          )}
        </div>
      )}

      <SavedList
        list={saved}
        onStatus={(id, status) => updateSaved((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))}
        onRemove={(id) => updateSaved((prev) => prev.filter((p) => p.id !== id))}
      />

      <p className="rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-muted">
        Odds are real bookmaker prices (mostly Betsson, whose prices track Stake&apos;s closely) from The Odds API.
        Stake itself isn&apos;t available, so always check the final price on Stake before betting. Player-to-score
        prices come from US bookmakers only and are rough. The options can share games. Odds refresh about once a
        day, so lines may have moved. &quot;All hit&quot; is the market&apos;s implied chance with the bookmaker&apos;s margin
        removed, and parlays still lose money over time because the margin multiplies across legs. Times are shown
        in your own time zone. For information only, not betting advice.
        {meta.updated && ` Odds fetched ${meta.updated}.`}
        {remaining !== null && ` Odds API credits left this month: ${remaining}.`}
      </p>
    </div>
  );
}
