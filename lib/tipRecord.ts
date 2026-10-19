// The tip-of-the-day track record lives in this browser only (localStorage): each
// day's tip is saved the first time it is shown, then checked against the final
// score once the match is over. Nothing is sent to a server except the match names
// when checking.

export type TipOutcome = "pending" | "won" | "lost" | "unknown";

export type TipEntry = {
  day: string; // UTC day the tip was shown, e.g. 2026-10-24
  pick: string;
  match: string; // "Home vs Away"
  league: string;
  date: string; // kick-off
  prob: number;
  outcome: TipOutcome;
};

const KEY = "tip-record-v1";
const KEEP = 60;

export function loadTips(): TipEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function storeTips(list: TipEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    // blocked storage (private windows): the record just doesn't persist
  }
  window.dispatchEvent(new Event(EVENT));
}

// For useSyncExternalStore: the stored text is the snapshot (a string compares by
// value), and the list is parsed from it.
const EVENT = "tips-changed";
export const tipsSnapshot = (): string => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
export function subscribeTips(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}
export function parseTips(raw: string): TipEntry[] {
  try {
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// A tip can be checked once its match is probably over.
export const checkable = (t: TipEntry, now = Date.now()) => {
  const age = now - new Date(t.date).getTime();
  return (t.outcome === "pending" || t.outcome === "unknown") && age > 2.5 * 60 * 60 * 1000 && age < 7 * 24 * 60 * 60 * 1000;
};
