import type { Game } from "@/lib/form";

const COLORS = {
  W: "bg-green-600",
  D: "bg-zinc-500",
  L: "bg-red-600",
};

// Oldest on the left, newest on the right (the usual way form is shown).
export function FormBadges({ games }: { games: Game[] }) {
  return (
    <span className="inline-flex gap-1">
      {[...games].reverse().map((g, i) => (
        <span
          key={i}
          title={`${g.home ? "vs" : "@"} ${g.opponent} ${g.gf}-${g.ga}`}
          className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-white ${COLORS[g.result]}`}
        >
          {g.result}
        </span>
      ))}
    </span>
  );
}
