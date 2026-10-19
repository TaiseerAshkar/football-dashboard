const bar = "shimmer rounded-md";

export function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
          <div className={`${bar} h-4 w-5`} />
          <div className={`${bar} h-7 w-7 rounded-full`} />
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

export function StoriesSkeleton() {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={`${bar} h-24 min-w-[15rem] rounded-2xl sm:min-w-0`} />
      ))}
    </div>
  );
}
