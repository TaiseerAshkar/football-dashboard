"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { checkTipResults } from "@/app/tip-actions";
import { checkable, loadTips, parseTips, storeTips, subscribeTips, tipsSnapshot, type TipEntry } from "@/lib/tipRecord";

const DOT = {
  won: "bg-good text-white",
  lost: "bg-bad text-white",
  pending: "bg-surface-2 text-muted ring-1 ring-line",
  unknown: "bg-surface-2 text-muted ring-1 ring-line",
};
const MARK = { won: "✓", lost: "✗", pending: "·", unknown: "?" };

// Saves today's tip the first time it is shown, checks old tips against the final
// scores, and shows how many hit.
export function TipRecord({ today }: { today: Omit<TipEntry, "outcome"> }) {
  const raw = useSyncExternalStore(subscribeTips, tipsSnapshot, () => "");
  const tips = useMemo(() => parseTips(raw), [raw]);

  useEffect(() => {
    let cancelled = false;
    let list = loadTips();
    if (!list.some((t) => t.day === today.day)) {
      list = [...list, { ...today, outcome: "pending" }];
      storeTips(list);
    }

    const due = list.filter((t) => checkable(t));
    if (due.length === 0) return;
    checkTipResults(due.map((t) => ({ id: t.day, pick: t.pick, match: t.match, league: t.league, date: t.date })))
      .then((results) => {
        if (cancelled) return;
        const byDay = new Map(results.map((r) => [r.id, r.result]));
        storeTips(
          loadTips().map((t) => {
            const r = byDay.get(t.day);
            return r === "won" || r === "lost" ? { ...t, outcome: r } : t;
          }),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [today]);

  const settled = tips.filter((t) => t.outcome === "won" || t.outcome === "lost");
  if (tips.length === 0) return null;
  const hit = settled.filter((t) => t.outcome === "won").length;
  const recent = tips.slice(-10);

  return (
    <div className="relative mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold">Your tip record</span>
        <span className="tabular-nums text-muted">
          {settled.length === 0 ? "first result comes after the match" : `${hit} of ${settled.length} hit · ${Math.round((hit / settled.length) * 100)}%`}
        </span>
      </div>
      <div className="mt-2 flex gap-1" aria-label="Recent tips, oldest first">
        {recent.map((t) => (
          <span
            key={t.day}
            title={`${t.day}: ${t.pick} (${t.match})`}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold ${DOT[t.outcome]}`}
          >
            {MARK[t.outcome]}
          </span>
        ))}
      </div>
    </div>
  );
}
