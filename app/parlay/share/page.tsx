import Link from "next/link";
import { Suspense } from "react";
import { SaveShared } from "@/app/components/SaveShared";
import { ListSkeleton } from "@/app/components/Skeletons";
import { decodeParlay, riskLabel } from "@/lib/share";

export const metadata = { title: "Shared parlay" };

const kickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

async function Shared({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const d = (await searchParams).d;
  const parlay = d ? await decodeParlay(d) : null;

  if (!parlay) {
    return (
      <div className="rounded-2xl border border-bad/30 bg-bad/10 p-5 text-sm text-bad">
        This parlay link isn&apos;t valid. It may have been cut off when it was copied. Ask your friend to send it
        again.
      </div>
    );
  }

  const r = riskLabel(parlay.chance);
  const built = new Date(parlay.builtAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-4">
      <article className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {parlay.plan} parlay · {parlay.picks.length} {parlay.picks.length === 1 ? "leg" : "legs"}
          </span>
          <span className={`text-sm font-semibold ${r.text}`}>{r.label}</span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${r.bar}`}
            style={{ width: `${Math.max(2, Math.min(100, parlay.chance * 100))}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-2 p-2.5">
            <div className="text-[11px] leading-tight text-muted">Total odds</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">x{parlay.odds.toFixed(2)}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-2.5">
            <div className="text-[11px] leading-tight text-muted">Chance all hit</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{(parlay.chance * 100).toFixed(1)}%</div>
          </div>
        </div>

        <ol className="mt-4 divide-y divide-line text-sm">
          {parlay.picks.map((p, i) => (
            <li key={i} className="flex items-start gap-2.5 py-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">{p.pick}</p>
                <p className="text-xs leading-snug text-muted">
                  {p.match} · {p.league} · {kickoff(p.date)} UTC
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">{p.odds.toFixed(2)}</p>
                <p className="text-[11px] tabular-nums text-muted">
                  {(p.prob * 100).toFixed(0)}% · {p.source}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <SaveShared parlay={parlay} />
      </article>

      <p className="rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-muted">
        Prices were taken on {built} UTC and may have moved, so check the current odds before betting. Stake itself
        isn&apos;t covered by the data source, so these are close prices from other bookmakers. For information only,
        not betting advice.
      </p>
    </div>
  );
}

export default function SharedParlayPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Shared parlay</h1>
        <p className="mt-2 text-sm text-muted">
          Someone sent you this bet.{" "}
          <Link href="/parlay" className="font-medium text-accent hover:underline">
            Build your own →
          </Link>
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Shared searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
