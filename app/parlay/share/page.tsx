import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { SaveShared } from "@/app/components/SaveShared";
import { ListSkeleton } from "@/app/components/Skeletons";
import { buildFormIndex, explain } from "@/lib/explain";
import { getMatches } from "@/lib/football";
import { LEAGUES } from "@/lib/leagues";
import type { Leg, LegKind } from "@/lib/odds";
import { decodeParlay, riskLabel, type SharedPick } from "@/lib/share";

type Search = Promise<{ d?: string }>;

// The title, description and preview image shown when the link is pasted into a chat app.
export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const d = (await searchParams).d;
  const parlay = d && /^[A-Za-z0-9_-]+$/.test(d) ? await decodeParlay(d) : null;
  if (!parlay || !d) return { title: "Shared parlay" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";

  const title = `x${parlay.odds.toFixed(2)} parlay · ${parlay.picks.length} ${parlay.picks.length === 1 ? "leg" : "legs"} · ${riskLabel(parlay.chance).label}`;
  const first = parlay.picks.slice(0, 4).map((p) => `${p.pick} (${p.odds.toFixed(2)})`).join(" · ");
  const rest = parlay.picks.length - 4;
  const description = rest > 0 ? `${first} · +${rest} more` : first;
  const image = `${origin}/parlay/share/og?d=${d}`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const kickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

// The link does not say which kind of bet each leg is, so work it out from its text.
function inferKind(pick: string): LegKind {
  if (pick.endsWith("to score anytime")) return "player";
  if (/^(Over|Under) [0-9.]+ goals$/.test(pick)) return "goals";
  if (pick.startsWith("Both teams")) return "btts";
  if (pick.endsWith(" or draw") || pick.startsWith("Either team")) return "dc";
  return "result";
}

function toLeg(p: SharedPick): Leg {
  const [home, away] = p.match.split(" vs ");
  return {
    matchId: p.match,
    sport: "",
    date: p.date,
    league: p.league,
    match: p.match,
    home: home ?? p.match,
    away: away ?? p.match,
    pick: p.pick,
    odds: p.odds,
    prob: p.prob,
    source: p.source,
    kind: inferKind(p.pick),
  };
}

async function Shared({ searchParams }: { searchParams: Search }) {
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

  // Fresh recent-form data (cached) so each leg can show why it could hit. If it
  // can't load, the reasons just get shorter.
  const lists = await Promise.all(LEAGUES.map((l) => getMatches(l.code)));
  const formIndex = buildFormIndex(lists.flatMap((r) => (r.ok ? [r.data] : [])));

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
            <li key={i} className="py-2.5">
              <div className="flex items-start gap-2.5">
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
              </div>
              <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11.5px] leading-snug">
                <span className="font-semibold text-accent">Why: </span>
                {explain(toLeg(p), formIndex)}
              </p>
            </li>
          ))}
        </ol>

        <SaveShared parlay={parlay} />
      </article>

      <p className="rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-muted">
        Prices were taken on {built} UTC and may have moved, so check the current odds before betting. Stake itself
        isn&apos;t covered by the data source, so these are close prices from other bookmakers. The reasons use recent
        results as of now. For information only, not betting advice.
      </p>
    </div>
  );
}

export default function SharedParlayPage({ searchParams }: { searchParams: Search }) {
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
