import Link from "next/link";
import { Suspense } from "react";
import { HeaderNav } from "@/app/components/HeaderNav";
import { ThemeToggle } from "@/app/components/ThemeToggle";

// Shown for a moment while HeaderNav finds out which page is open.
function PlainNav() {
  const link = "rounded-full px-3 py-1.5 text-sm font-medium text-muted";
  return (
    <nav className="flex items-center gap-1" aria-label="Main">
      <span className={link}>Tables</span>
      <span className={link}>Parlay builder</span>
    </nav>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-base text-white shadow-card"
          >
            ⚽
          </span>
          <span className="hidden min-[380px]:inline">Football Dashboard</span>
        </Link>
        <div className="flex items-center gap-2">
          <Suspense fallback={<PlainNav />}>
            <HeaderNav />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
