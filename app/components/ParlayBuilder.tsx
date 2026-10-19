"use client";

import { useEffect, useRef, useState } from "react";
import { checkSavedParlays, loadExtraOdds } from "@/app/parlay/actions";
import { explain, type TeamForm } from "@/lib/explain";
import {
  loadSaved,
  newId,
  signature,
  storeSaved,
  type LegResult,
  type SavedParlay,
  type SavedStatus,
} from "@/lib/saved";
import type { ExtraMarket, ExtraRequest, Leg, LegKind } from "@/lib/odds";
import { shareParlay, type SharedParlay } from "@/lib/share";

type Built = {
  picks: Leg[];
  odds: number;
  chance: number;
  avgLeg: number;
  close: boolean;
  name: string;
  blurb: string;
  tried: string[]; // bets already offered for a swap, so Swap never repeats itself
};

const TARGETS = [2, 3, 5, 10, 20, 50, 100, 150, 300];
const MAX_GAMES = 30;
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
  lo: number, // ln of the lowest acceptable total odds
  hi: number, // ln of the highest acceptable total odds
  minOdds: number,
  pinned: Set<string>, // matches that must be in the parlay
  score: (sel: Leg[]) => number,
): Leg[] | null {
  let pool = legs.filter((l) => l.odds >= minOdds || pinned.has(l.matchId));
  if (new Set(pool.map((l) => l.matchId)).size < n) pool = legs; // too few matches: relax the minimum
  const matchIds = [...new Set(pool.map((l) => l.matchId))];
  if (matchIds.length < n) return null;

  const mid = (lo + hi) / 2; // aim for the middle of the range
  const g = mid / n; // ideal log-odds per leg
  const byMatch = new Map<string, Leg[]>();
  for (const p of pool) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);

  let best: Leg[] | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 200; attempt++) {
    const pins = matchIds.filter((id) => pinned.has(id));
    const ids = [...pins, ...shuffle(matchIds.filter((id) => !pinned.has(id))).slice(0, n - pins.length)];
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
      // a pinned match stays; only its bet can change
      const candidates = pinned.has(sel[i].matchId)
        ? pool.filter((p) => p.matchId === sel[i].matchId)
        : pool.filter((p) => !used.has(p.matchId));
      const trial = sel.map((p, k) =>
        k === i ? candidates[Math.floor(Math.random() * candidates.length)] : p,
      );
      // also try the single best fix for this slot
      const others = sel.reduce((s, p, k) => (k === i ? s : s + Math.log(p.odds)), 0);
      const need = mid - others;
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

// Works out the totals for a chosen set of legs.
function finish(picks: Leg[], name: string, blurb: string, low: number, high: number, tried: string[] = []): Built {
  const sorted = [...picks].sort((a, b) => a.date.localeCompare(b.date));
  const odds = sorted.reduce((s, p) => s * p.odds, 1);
  const chance = sorted.reduce((s, p) => s * p.prob, 1);
  const avgLeg = sorted.reduce((s, p) => s + p.prob, 0) / sorted.length;
  const tolerance = low === high ? 0.15 : 0.03; // a fixed number is allowed more slack than a range
  const t = Math.log(odds);
  return {
    picks: sorted,
    odds,
    chance,
    avgLeg,
    close: t >= Math.log(low) - tolerance && t <= Math.log(high) + tolerance,
    name,
    blurb,
    tried,
  };
}

// Three genuinely different ideas for the same games and total odds.
function build(legs: Leg[], n: number, low: number, high: number, pinned: Set<string>): Built[] | string {
  const matchCount = new Set(legs.map((l) => l.matchId)).size;
  if (matchCount < n) {
    return `Only ${matchCount} ${matchCount === 1 ? "match" : "matches"} with the chosen bet types in that date range. Choose fewer games, more bet types, or widen the dates.`;
  }
  const lo = Math.log(low);
  const hi = Math.log(high);
  const g = (lo + hi) / 2 / n;
  // zero anywhere inside the wanted range, growing the further outside it is
  const delta = (sel: Leg[]) => {
    const t = logSum(sel);
    return (t < lo ? lo - t : t > hi ? t - hi : 0) * 15;
  };
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
    const sel = search(legs, n, lo, hi, plan.minOdds, pinned, (s) => plan.score(s, taken, takenMatches));
    if (!sel) continue;
    keys(sel).forEach((k) => taken.add(k));
    sel.forEach((p) => takenMatches.add(p.matchId));
    out.push(finish(sel, plan.name, plan.blurb, low, high));
  }
  return out.length ? out : "Could not build options from these matches.";
}

const field =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent";

// The dashed tear line of a ticket, with a notch punched out of each side.
function TicketCut() {
  return (
    <div className="relative -mx-4 my-3.5" aria-hidden>
      <div className="mx-4 border-t-2 border-dashed border-line" />
      <span className="absolute left-0 top-0 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-background" />
      <span className="absolute right-0 top-0 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border border-line bg-background" />
    </div>
  );
}

function OptionCard({
  built,
  index,
  targetLabel,
  formIndex,
  saved,
  onSave,
  builtAt,
  stake,
  onSwap,
  open,
  onToggle,
}: {
  built: Built;
  index: number;
  targetLabel: string;
  formIndex: TeamForm[];
  saved: boolean;
  onSave: () => void;
  builtAt: string;
  stake: number;
  onSwap: (legIndex: number) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const r = risk(built.chance);
  return (
    <article
      className="card-lift fade-up relative flex flex-col rounded-2xl border border-line bg-surface p-4 pt-5 shadow-card"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <span aria-hidden className={`absolute inset-x-6 top-0 h-1 rounded-b-full ${r.bar}`} />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} option ${index + 1}`}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Option {index + 1}
          <span className="ml-1.5 normal-case text-accent">· {built.name}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${r.text}`}>{r.label}</span>
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-muted">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </span>
      </button>
      {!open && (
        <p className="mt-2 text-sm">
          <b className="tabular-nums">x{built.odds.toFixed(2)}</b> · {(built.chance * 100).toFixed(1)}% to hit ·{" "}
          {built.picks.length} {built.picks.length === 1 ? "leg" : "legs"}
          {stake > 0 && <> · returns {(stake * built.odds).toFixed(2)}</>}
        </p>
      )}
      {open && (
        <>
      <p className="mt-1 text-xs text-muted">{built.blurb}</p>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${r.bar}`}
          style={{ width: `${Math.max(2, Math.min(100, built.chance * 100))}%` }}
        />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Total odds</div>
          <div className="text-gradient text-5xl font-extrabold leading-none tracking-tight tabular-nums">
            x{built.odds.toFixed(2)}
          </div>
        </div>
        {stake > 0 ? (
          <div className="rounded-xl bg-accent-soft px-3 py-2 text-right">
            <div className="text-[11px] font-medium text-muted">Stake {stake} returns</div>
            <div className="text-2xl font-extrabold leading-tight tabular-nums text-accent">
              {(stake * built.odds).toFixed(2)}
            </div>
            <div className="text-[11px] font-semibold tabular-nums text-good">
              profit +{(stake * built.odds - stake).toFixed(2)}
            </div>
          </div>
        ) : (
          <p className="max-w-[9rem] text-right text-xs text-muted">Enter a stake above to see your payout</p>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        <b className="tabular-nums text-foreground">{(built.chance * 100).toFixed(1)}%</b> chance all hit ·{" "}
        <b className="tabular-nums text-foreground">{(built.avgLeg * 100).toFixed(0)}%</b> avg leg
      </p>
      {!built.close && (
        <p className="mt-2 text-xs text-muted">Closest I could get to {targetLabel} with these settings.</p>
      )}

      <TicketCut />
      <ol className="divide-y divide-line text-sm">
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
                <button
                  type="button"
                  onClick={() => onSwap(i)}
                  aria-label={`Swap ${p.pick}`}
                  title="Replace this leg with another bet that keeps your total odds"
                  className="mt-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-xs font-semibold text-muted transition hover:border-accent hover:bg-accent-soft hover:text-accent active:scale-95 sm:h-7"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M16 3l4 4-4 4" />
                    <path d="M20 7H8" />
                    <path d="M8 21l-4-4 4-4" />
                    <path d="M4 17h12" />
                  </svg>
                  Swap
                </button>
              </div>
            </div>
            <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11.5px] leading-snug">
              <span className="font-semibold text-accent">Why: </span>
              {explain(p, formIndex)}
            </p>
          </li>
        ))}
      </ol>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saved}
          className={`h-10 rounded-xl border text-sm font-semibold transition ${
            saved
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-surface hover:border-accent hover:text-accent"
          }`}
        >
          {saved ? "✓ Saved" : "Save"}
        </button>
        <ShareButton
          parlay={toShared(built.name, built.odds, built.chance, built.picks, builtAt)}
          className="h-10 rounded-xl border border-line bg-surface text-sm font-semibold transition hover:border-accent hover:text-accent"
        />
      </div>
        </>
      )}
    </article>
  );
}

const toShared = (
  plan: string,
  odds: number,
  chance: number,
  picks: SharedParlay["picks"],
  builtAt: string,
): SharedParlay => ({
  plan,
  odds,
  chance,
  builtAt,
  picks: picks.map((p) => ({
    pick: p.pick,
    match: p.match,
    league: p.league,
    date: p.date,
    odds: p.odds,
    prob: p.prob,
    source: p.source,
  })),
});

// Makes a link containing this exact bet: copies it on a computer, opens the share sheet on a phone.
function ShareButton({ parlay, className }: { parlay: SharedParlay; className: string }) {
  const [state, setState] = useState<"idle" | "copied" | "shared">("idle");
  async function click() {
    const result = await shareParlay(parlay);
    if (result === "failed") return;
    setState(result);
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <button type="button" onClick={click} className={className}>
      {state === "copied" ? "✓ Link copied" : state === "shared" ? "✓ Shared" : "Share link"}
    </button>
  );
}

const STATUS_LABEL: Record<SavedStatus, string> = { pending: "Pending", won: "Won", lost: "Lost" };
const STATUS_STYLE: Record<SavedStatus, string> = {
  pending: "border-accent bg-accent-soft text-accent",
  won: "border-good bg-good/15 text-good",
  lost: "border-bad bg-bad/15 text-bad",
};

const LEG_MARK: Record<LegResult, { icon: string; style: string; tip: string }> = {
  won: { icon: "✓", style: "text-good", tip: "Won" },
  lost: { icon: "✗", style: "text-bad", tip: "Lost" },
  pending: { icon: "…", style: "text-muted", tip: "Not played yet" },
  unknown: { icon: "?", style: "text-warn", tip: "Can't be checked automatically, mark it yourself" },
};

const money = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(2)}`;

function SavedList({
  list,
  checking,
  onCheck,
  onStatus,
  onRemove,
}: {
  list: SavedParlay[];
  checking: boolean;
  onCheck: () => void;
  onStatus: (id: string, status: SavedStatus) => void;
  onRemove: (id: string) => void;
}) {
  if (list.length === 0) return null;
  const won = list.filter((p) => p.status === "won").length;
  const lost = list.filter((p) => p.status === "lost").length;
  const pending = list.length - won - lost;

  // profit across finished parlays that had a stake
  let net = 0;
  let hasNet = false;
  for (const p of list) {
    if (!p.stake || p.stake <= 0) continue;
    if (p.status === "won") {
      net += p.stake * (p.odds - 1);
      hasNet = true;
    } else if (p.status === "lost") {
      net -= p.stake;
      hasNet = true;
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Saved parlays</h2>
          <p className="text-sm text-muted">
            <b className="text-good">{won} won</b> · <b className="text-bad">{lost} lost</b> · {pending} pending
            {hasNet && (
              <>
                {" "}
                · net <b className={net >= 0 ? "text-good" : "text-bad"}>{money(net)}</b>
              </>
            )}
            . Saved in this browser only.
          </p>
        </div>
        <button
          type="button"
          onClick={onCheck}
          disabled={checking}
          className="h-9 rounded-xl border border-line bg-surface px-3 text-sm font-semibold transition hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {checking ? "Checking..." : "Check results"}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {list.map((p) => {
          const res = p.results;
          const legWon = res?.filter((r) => r === "won").length ?? 0;
          const legLost = res?.filter((r) => r === "lost").length ?? 0;
          const legUnknown = res?.filter((r) => r === "unknown").length ?? 0;
          return (
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
                <div className="flex shrink-0 items-center gap-1">
                  <ShareButton
                    parlay={toShared(p.plan, p.odds, p.chance, p.picks, p.savedAt)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-surface-2"
                  />
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
              </div>

              {p.stake ? (
                <p className="mt-2 text-sm">
                  Stake <b>{p.stake}</b> → returns <b>{(p.stake * p.odds).toFixed(2)}</b>
                  {p.status === "won" && (
                    <b className="ml-2 text-good">{money(p.stake * (p.odds - 1))}</b>
                  )}
                  {p.status === "lost" && <b className="ml-2 text-bad">{money(-p.stake)}</b>}
                </p>
              ) : null}

              {res && (
                <p className="mt-2 text-xs text-muted">
                  <b className="text-good">{legWon}</b> of {p.picks.length} legs won
                  {legLost > 0 && (
                    <>
                      {" "}
                      · <b className="text-bad">{legLost} lost</b>
                    </>
                  )}
                  {legUnknown > 0 && <> · {legUnknown} to mark yourself</>}
                </p>
              )}

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
                  {p.picks.map((leg, i) => {
                    const mark = res?.[i] ? LEG_MARK[res[i]] : null;
                    return (
                      <li key={i} className="flex items-start justify-between gap-3 py-2">
                        <div className="flex min-w-0 gap-2">
                          {mark && (
                            <span title={mark.tip} className={`mt-0.5 w-4 shrink-0 text-center font-bold ${mark.style}`}>
                              {mark.icon}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium leading-snug">{leg.pick}</p>
                            <p className="text-xs leading-snug text-muted">
                              {leg.match} · {leg.league} · {formatKickoff(leg.date)}
                            </p>
                          </div>
                        </div>
                        <b className="shrink-0 tabular-nums">{leg.odds.toFixed(2)}</b>
                      </li>
                    );
                  })}
                </ol>
              </details>
            </article>
          );
        })}
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
  meta: { remaining: number | null; updated: string | null; fetchedAt: string | null };
}) {
  const [countPreset, setCountPreset] = useState("5");
  const [customGames, setCustomGames] = useState("");
  const [preset, setPreset] = useState("5");
  const [custom, setCustom] = useState("");
  const [rangeLow, setRangeLow] = useState("4");
  const [rangeHigh, setRangeHigh] = useState("6");
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
  const [stake, setStake] = useState("10");
  const [pinned, setPinned] = useState<string[]>([]);
  const [query, setQuery] = useState<{ pool: Leg[]; low: number; high: number; pinned: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<boolean[]>([true, true, true]);
  const checkedOnce = useRef(false);

  // Default range: today to a week from now (set after load so the server and
  // browser, which can be in different time zones, never disagree).
  useEffect(() => {
    const today = new Date();
    setFrom(localDate(today));
    setTo(localDate(addDays(today, 6)));
    setSaved(loadSaved()); // saved parlays live in this browser only
    try {
      const s = localStorage.getItem("parlay-stake");
      if (s !== null) setStake(s);
    } catch {}
  }, []);

  function changeStake(value: string) {
    setStake(value);
    try {
      localStorage.setItem("parlay-stake", value);
    } catch {}
  }

  // Looks up the finished results for saved parlays that are still pending and
  // marks each leg (and the parlay) won or lost. Manual choices are never overridden.
  async function checkSaved(list: SavedParlay[]) {
    const todo = list.filter((p) => p.status === "pending");
    if (todo.length === 0) return;
    setChecking(true);
    try {
      const res = await checkSavedParlays(
        todo.map((p) => ({
          id: p.id,
          picks: p.picks.map((x) => ({ pick: x.pick, match: x.match, league: x.league, date: x.date })),
        })),
      );
      updateSaved((prev) =>
        prev.map((p) => {
          const r = res.find((x) => x.id === p.id);
          if (!r || p.status !== "pending") return p;
          const status: SavedStatus = r.legs.includes("lost") ? "lost" : r.legs.every((l) => l === "won") ? "won" : "pending";
          return { ...p, results: r.legs, checkedAt: new Date().toISOString(), status };
        }),
      );
    } catch {
      // the check is a convenience; failing quietly leaves everything as it was
    }
    setChecking(false);
  }

  // check once automatically when the saved list first loads
  useEffect(() => {
    if (!checkedOnce.current && saved.length > 0) {
      checkedOnce.current = true;
      void checkSaved(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

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
        stake: Number(stake) > 0 ? Number(stake) : undefined,
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

  const count = countPreset === "custom" ? Number(customGames) : Number(countPreset);
  const isRange = preset === "range";
  const low = isRange ? Number(rangeLow) : preset === "custom" ? Number(custom) : Number(preset);
  const high = isRange ? Number(rangeHigh) : low;
  const targetLabel = isRange ? `x${rangeLow} to x${rangeHigh}` : `x${low}`;

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
    if (pool.length === 0) {
      setQuery(null);
      return setResults("No matches with those bet types in that date range.");
    }
    const inPool = new Set(pool.map((l) => l.matchId));
    const pins = pinned.filter((id) => inPool.has(id));
    if (pins.length < pinned.length) {
      setNotice("A game you pinned was left out: it has no bets for the chosen bet types, or it is outside the dates.");
    }
    if (pins.length > count) {
      setQuery(null);
      return setResults(`You pinned ${pins.length} games but chose ${count} games. Choose more games or remove a pin.`);
    }
    const out = build(pool, count, low, high, new Set(pins));
    setResults(out);
    if (typeof out !== "string") setOpen(out.map(() => true)); // a fresh build starts with every option open
    setQuery(typeof out === "string" ? null : { pool, low, high, pinned: pins });
  }

  // Replaces one leg with the next-best bet that keeps the total odds in range.
  function swapLeg(optionIndex: number, legIndex: number) {
    if (!query || !Array.isArray(results)) return;
    const b = results[optionIndex];
    const cur = b.picks[legIndex];
    const others = b.picks.filter((_, k) => k !== legIndex);
    const used = new Set(others.map((p) => p.matchId));
    const key = (l: Leg) => `${l.matchId}|${l.pick}`;
    const tried = new Set([...b.tried, key(cur)]);
    const isPinned = query.pinned.includes(cur.matchId);

    const candidates = query.pool.filter((p) => {
      if (tried.has(key(p))) return false;
      return isPinned ? p.matchId === cur.matchId : !used.has(p.matchId);
    });
    if (candidates.length === 0) {
      setNotice("There is no other bet that fits that slot.");
      return;
    }
    const lo = Math.log(query.low);
    const hi = Math.log(query.high);
    const base = others.reduce((s, p) => s + Math.log(p.odds), 0);
    const cost = (c: Leg) => {
      const t = base + Math.log(c.odds);
      const outside = t < lo ? lo - t : t > hi ? t - hi : 0;
      return outside * 15 - Math.log(c.prob) + (c.odds < 1.1 ? 1 : 0) + Math.random() * 0.02;
    };
    const next = candidates.reduce((x, y) => (cost(x) <= cost(y) ? x : y));
    // never accept a swap that pushes the total odds away from the target
    const total = base + Math.log(next.odds);
    const slack = query.low === query.high ? 0.15 : 0.03;
    if (total < lo - slack || total > hi + slack) {
      setNotice("No other bet for that slot keeps your total odds on target. Try swapping a different leg.");
      return;
    }
    setNotice(null);
    setResults(
      results.map((r, k) =>
        k === optionIndex ? finish([...others, next], r.name, r.blurb, query.low, query.high, [...tried, key(next)]) : r,
      ),
    );
  }

  function run() {
    setNotice(null);
    setConfirm(null);
    if (!Number.isInteger(count) || count < 1 || count > MAX_GAMES) {
      return setResults(`Enter a number of games from 1 to ${MAX_GAMES}.`);
    }
    if (!(low > 1) || !(high >= low)) {
      return setResults(
        isRange
          ? "Enter a range like 4 to 6, with the second number at least as big as the first."
          : "Enter target odds above 1.",
      );
    }
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

  // distinct matches inside the chosen dates, for the "pin a game" list
  const rangeMatches = (() => {
    if (!from || !to || from > to) return [] as Leg[];
    const ok = inRange();
    const byMatch = new Map<string, Leg>();
    for (const l of legs) if (ok(l) && !byMatch.has(l.matchId)) byMatch.set(l.matchId, l);
    return [...byMatch.values()].sort((a, b) => a.date.localeCompare(b.date));
  })();

  const built = results && typeof results !== "string" ? results : null;
  const confirmMatches = confirm ? new Set(confirm.map((c) => c.id)).size : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-medium">
            <span className="mb-1.5 block text-muted">Number of games</span>
            <select value={countPreset} onChange={(e) => setCountPreset(e.target.value)} className={field}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "game" : "games"}
                </option>
              ))}
              <option value="custom">Custom...</option>
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
              <option value="range">Range...</option>
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

        {countPreset === "custom" && (
          <label className="mt-4 block max-w-[12rem] text-sm font-medium">
            <span className="mb-1.5 block text-muted">Custom number of games</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_GAMES}
              step="1"
              value={customGames}
              onChange={(e) => setCustomGames(e.target.value)}
              placeholder={`1 to ${MAX_GAMES}`}
              className={field}
            />
          </label>
        )}

        {isRange && (
          <div className="mt-4 flex max-w-sm items-end gap-3">
            <label className="block flex-1 text-sm font-medium">
              <span className="mb-1.5 block text-muted">Odds from</span>
              <input
                type="number"
                inputMode="decimal"
                min="1.1"
                step="0.1"
                value={rangeLow}
                onChange={(e) => setRangeLow(e.target.value)}
                placeholder="e.g. 4"
                className={field}
              />
            </label>
            <span className="pb-3 text-muted">to</span>
            <label className="block flex-1 text-sm font-medium">
              <span className="mb-1.5 block text-muted">Odds up to</span>
              <input
                type="number"
                inputMode="decimal"
                min="1.1"
                step="0.1"
                value={rangeHigh}
                onChange={(e) => setRangeHigh(e.target.value)}
                placeholder="e.g. 6"
                className={field}
              />
            </label>
          </div>
        )}

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

        <label className="mt-4 block max-w-[12rem] text-sm font-medium">
          <span className="mb-1.5 block text-muted">Stake (optional)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={stake}
            onChange={(e) => changeStake(e.target.value)}
            placeholder="e.g. 10"
            className={field}
          />
        </label>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-muted">
            Games to include <span className="font-normal">(optional)</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {pinned.map((id) => {
              const l = legs.find((x) => x.matchId === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent"
                >
                  {l?.match ?? "Game"}
                  <button
                    type="button"
                    aria-label="Remove this game"
                    onClick={() => setPinned((prev) => prev.filter((x) => x !== id))}
                  >
                    ✕
                  </button>
                </span>
              );
            })}
            <select
              value=""
              onChange={(e) => e.target.value && setPinned((prev) => [...prev, e.target.value])}
              aria-label="Pin a game"
              className="h-9 max-w-full rounded-xl border border-line bg-surface px-2 text-xs"
            >
              <option value="">+ Pin a game...</option>
              {rangeMatches
                .filter((m) => !pinned.includes(m.matchId))
                .map((m) => (
                  <option key={m.matchId} value={m.matchId}>
                    {m.match} · {m.league} ·{" "}
                    {new Date(m.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </option>
                ))}
            </select>
          </div>
          <p className="mt-1.5 text-xs text-muted">Pinned games appear in every option. The bet on them can still change.</p>
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
          {built.length > 1 && (
            <div className="flex justify-end lg:hidden">
              <button
                type="button"
                onClick={() => setOpen((prev) => prev.map(() => !prev.every(Boolean)))}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
              >
                {open.slice(0, built.length).every(Boolean) ? "Collapse all" : "Expand all"}
              </button>
            </div>
          )}
          <div className="grid items-start gap-4 lg:grid-cols-3">
            {built.map((b, i) => (
              <OptionCard
                key={i}
                built={b}
                index={i}
                targetLabel={targetLabel}
                formIndex={formIndex}
                saved={saved.some((p) => signature(p.picks) === signature(b.picks))}
                onSave={() => saveBuilt(b)}
                builtAt={meta.fetchedAt ?? new Date().toISOString()}
                stake={Number(stake) > 0 ? Number(stake) : 0}
                onSwap={(legIndex) => swapLeg(i, legIndex)}
                open={open[i] ?? true}
                onToggle={() => setOpen((prev) => prev.map((v, k) => (k === i ? !v : v)))}
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
        checking={checking}
        onCheck={() => checkSaved(saved)}
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
