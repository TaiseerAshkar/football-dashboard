import type { Game } from "@/lib/analysis";

const COLORS = {
  W: "bg-good text-white",
  D: "bg-muted/60 text-white",
  L: "bg-bad text-white",
};

// Oldest on the left, newest on the right (the usual way form is shown).
export function FormBadges({ games, size = "md" }: { games: Game[]; size?: "sm" | "md" }) {
  const box =
    size === "sm" ? "h-4 w-4 text-[9px]" : "h-4 w-4 text-[9px] sm:h-5 sm:w-5 sm:text-[10px]";
  return (
    <span className="inline-flex gap-0.5 sm:gap-1" aria-label={`Form: ${games.map((g) => g.result).join(" ")}`}>
      {[...games].reverse().map((g, i) => (
        <span
          key={i}
          title={`${g.home ? "vs" : "@"} ${g.opponent} ${g.gf}-${g.ga}`}
          className={`inline-flex items-center justify-center rounded-[5px] font-bold ${box} ${COLORS[g.result]}`}
        >
          {g.result}
        </span>
      ))}
    </span>
  );
}
