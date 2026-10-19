import { connection } from "next/server";
import { TipRecord } from "@/app/components/TipRecord";
import { getMatches } from "@/lib/football";
import { LEAGUES } from "@/lib/leagues";
import { tipOfTheDay } from "@/lib/tip";

const kickoff = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

const shell = "fade-up relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5";

// The most likely thing to happen in today's remaining matches, across every league.
export async function TipOfTheDay() {
  await connection(); // depends on the current time
  const lists = await Promise.all(
    LEAGUES.map(async (l) => {
      const r = await getMatches(l.code);
      return { leagueName: l.name, matches: r.ok ? r.data : [] };
    }),
  );
  const result = tipOfTheDay(lists, Date.now());

  const glow = <div aria-hidden className="pointer-events-none absolute -left-10 -top-12 h-36 w-36 rounded-full bg-accent/20 blur-3xl" />;
  const label = <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">💡 Tip of the day</p>;

  if (result.kind === "wait") {
    return (
      <section className={shell}>
        {glow}
        {label}
        <p className="relative mt-2 text-base font-semibold leading-snug">
          {result.hadGames ? "Today's games have all kicked off." : "No games left today."} Wait until tomorrow for a new tip.
        </p>
        {result.nextDay && <p className="relative mt-1 text-xs text-muted">Next games: {dayLabel(result.nextDay)}.</p>}
      </section>
    );
  }

  const [top, ...others] = result.tips;
  return (
    <section className={shell}>
      {glow}
      {label}
      <p className="relative mt-2 text-xl font-bold leading-tight tracking-tight">{top.pick}</p>
      <p className="relative mt-1 text-sm">
        {top.home} vs {top.away}
      </p>
      <p className="relative text-xs text-muted">
        {top.leagueName} · {kickoff(top.date)} UTC
      </p>
      <div className="relative mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-sm font-bold tabular-nums text-accent">{top.prob}% likely</span>
        <span className="text-[11px] text-muted">{top.why}</span>
      </div>
      {others.length > 0 && (
        <ul className="relative mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
          {others.map((t) => (
            <li key={t.matchId} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                <b className="font-semibold">{t.pick}</b> <span className="text-muted">· {t.home} v {t.away}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted">{t.prob}%</span>
            </li>
          ))}
        </ul>
      )}
      <TipRecord
        today={{
          day: top.date.slice(0, 10),
          pick: top.pick,
          match: `${top.home} vs ${top.away}`,
          league: top.leagueName,
          date: top.date,
          prob: top.prob,
        }}
      />
      <p className="relative mt-3 text-[11px] text-muted">From a simple goals model, not a guarantee.</p>
    </section>
  );
}
