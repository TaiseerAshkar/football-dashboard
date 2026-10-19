const bar = "animate-pulse rounded-md bg-surface-2";

export function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
          <div className={`${bar} h-4 w-5`} />
          <div className={`${bar} h-6 w-6 rounded-full`} />
          <div className={`${bar} h-4 flex-1`} />
          <div className={`${bar} h-4 w-16`} />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className={`${bar} h-5 w-32`} />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`${bar} h-8`} />
      ))}
    </div>
  );
}
