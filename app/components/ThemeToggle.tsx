"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  // The class is already set by the inline script in layout.tsx; just read it.
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-full border px-3 py-1 text-sm hover:bg-black/[.06] dark:hover:bg-white/[.1]"
    >
      {dark === null ? "Theme" : dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
