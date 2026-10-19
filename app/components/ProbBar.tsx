// A three-part bar: first side (accent), draw (grey), second side (blue).
export function ProbBar({
  first,
  draw,
  second,
  className = "",
}: {
  first: number;
  draw: number;
  second: number;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${first}% / ${draw}% / ${second}%`}
      className={`flex h-2 overflow-hidden rounded-full bg-surface-2 ${className}`}
    >
      <div className="bg-accent" style={{ width: `${first}%` }} />
      <div className="bg-muted/40" style={{ width: `${draw}%` }} />
      <div className="bg-info" style={{ width: `${second}%` }} />
    </div>
  );
}
