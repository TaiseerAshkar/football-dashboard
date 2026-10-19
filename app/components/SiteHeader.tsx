import Link from "next/link";
import { Suspense } from "react";
import { HeaderNav } from "@/app/components/HeaderNav";
import { QuickSearch } from "@/app/components/QuickSearch";
import { ThemeToggle } from "@/app/components/ThemeToggle";

// Shown for a moment while HeaderNav finds out which page is open.
function PlainNav() {
  const link = "rounded-full px-3 py-1.5 text-sm font-medium text-muted";
  return (
    <nav className="flex items-center gap-1" aria-label="Main">
      <span className={link}>Tables</span>
      <span className={link}>Compare</span>
      <span className={link}>Parlay</span>
    </nav>
  );
}

// On very narrow phones the links drop to a second row, so the logo, search and
// theme buttons always fit on the first.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-info text-base text-white shadow-card ring-1 ring-white/20"
          >
            ⚽
          </span>
          <span className="hidden min-[380px]:inline">Football Dashboard</span>
        </Link>
        <div className="order-3 flex w-full justify-center min-[400px]:order-none min-[400px]:w-auto">
          <Suspense fallback={<PlainNav />}>
            <HeaderNav />
          </Suspense>
        </div>
        <div className="flex items-center gap-2">
          <QuickSearch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
