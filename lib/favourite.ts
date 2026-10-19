"use client";

import { useSyncExternalStore } from "react";

// The favourite team lives in this browser only (localStorage). Every component
// that shows it listens for changes, so pinning a team updates the page at once.
export type Favourite = { id: number; name: string };

const KEY = "favourite-team-v1";
const EVENT = "favourite-changed";

let lastRaw: string | null | undefined;
let lastValue: Favourite | null = null;

// Must return the same object until the stored text changes.
function snapshot(): Favourite | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== lastRaw) {
    lastRaw = raw;
    try {
      const v = raw ? JSON.parse(raw) : null;
      lastValue = v && typeof v.id === "number" && typeof v.name === "string" ? v : null;
    } catch {
      lastValue = null;
    }
  }
  return lastValue;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

export function useFavourite(): Favourite | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function setFavourite(fav: Favourite | null) {
  try {
    if (fav) localStorage.setItem(KEY, JSON.stringify(fav));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

// Lets any component open the search box (it listens for this event).
export const openSearch = () => window.dispatchEvent(new Event("open-search"));
