"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Shown when a section fails to load (usually the API's per-minute limit).
// Re-asks the server every 8 seconds, up to 10 times; if the data arrives,
// this component is replaced by the real content.
export function RetryNotice({ message }: { message: string }) {
  const router = useRouter();

  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > 10) return clearInterval(id);
      router.refresh();
    }, 8000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm"
    >
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-warn"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        aria-hidden
      >
        <path d="M21 12a9 9 0 1 1-6.2-8.55" strokeLinecap="round" />
      </svg>
      <div>
        <p className="font-medium">{message}</p>
        <p className="text-muted">Trying again automatically. This is usually a short API limit.</p>
      </div>
    </div>
  );
}
