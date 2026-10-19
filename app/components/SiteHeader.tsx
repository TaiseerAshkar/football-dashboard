import Link from "next/link";
import { HeaderNav } from "@/app/components/HeaderNav";
import { ThemeToggle } from "@/app/components/ThemeToggle";

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
          <HeaderNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
