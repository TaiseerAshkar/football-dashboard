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
    <p className="text-red-600">
      {message}. Retrying automatically...
    </p>
  );
}
