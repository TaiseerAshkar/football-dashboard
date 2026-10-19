"use client";

import { useSyncExternalStore } from "react";

// Favourite teams live in this browser only (localStorage), as many as the user
// likes. Every component that shows them listens for changes, so pinning a team
// updates the page at once.
export type Favourite = { id: number; name: string };

const KEY = "favourite-teams-v1";
const OLD_KEY = "favourite-team-v1"; // single favourite from the first version
const EVENT = "favourite-changed";

const EMPTY: Favourite[] = [];
let lastRaw: string | null | undefined;
let lastValue: Favourite[] = EMPTY;

const valid = (v: unknown): v is Favourite =>
  !!v && typeof (v as Favourite).id === "number" && typeof (v as Favourite).name === "string";

function read(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) return raw;
    const old = localStorage.getItem(OLD_KEY);
    return old ? `[${old}]` : null;
  } catch {
    return null;
  }
}

// Must return the same array until the stored text changes.
function snapshot(): Favourite[] {
  const raw = read();
  if (raw !== lastRaw) {
    lastRaw = raw;
    try {
      const v = raw ? JSON.parse(raw) : [];
      lastValue = Array.isArray(v) && v.length > 0 ? v.filter(valid) : EMPTY;
    } catch {
      lastValue = EMPTY;
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

export function useFavourites(): Favourite[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

function save(list: Favourite[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    localStorage.removeItem(OLD_KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

// Adds the team, or removes it when it is already a favourite.
export function toggleFavourite(fav: Favourite) {
  const list = snapshot();
  save(list.some((f) => f.id === fav.id) ? list.filter((f) => f.id !== fav.id) : [...list, fav]);
}

export function removeFavourite(id: number) {
  save(snapshot().filter((f) => f.id !== id));
}

// Lets any component open the search box (it listens for this event).
export const openSearch = () => window.dispatchEvent(new Event("open-search"));
