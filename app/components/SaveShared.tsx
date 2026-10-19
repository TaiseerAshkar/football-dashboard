"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadSaved, newId, signature, storeSaved, type SavedParlay } from "@/lib/saved";
import type { SharedParlay } from "@/lib/share";

// Lets a friend keep a shared parlay in their own saved list (their browser only).
export function SaveShared({ parlay }: { parlay: SharedParlay }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const sig = signature(parlay.picks);
    setDone(loadSaved().some((p) => signature(p.picks) === sig));
  }, [parlay]);

  function save() {
    const list = loadSaved();
    const entry: SavedParlay = {
      id: newId(),
      savedAt: new Date().toISOString(),
      plan: parlay.plan,
      odds: parlay.odds,
      chance: parlay.chance,
      status: "pending",
      picks: parlay.picks,
    };
    storeSaved([entry, ...list]);
    setDone(true);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={save}
        disabled={done}
        className={`h-10 rounded-xl border px-4 text-sm font-semibold transition ${
          done ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:border-accent hover:text-accent"
        }`}
      >
        {done ? "✓ Saved to my parlays" : "Save to my parlays"}
      </button>
      {done && (
        <Link href="/parlay" className="text-sm font-medium text-accent hover:underline">
          See my saved parlays →
        </Link>
      )}
    </div>
  );
}
