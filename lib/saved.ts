// Saved parlays live in the visitor's own browser (localStorage): nothing is
// sent to a server, so each person only sees their own, and clearing the
// browser's site data removes them.

export type SavedStatus = "pending" | "won" | "lost";

export type SavedPick = {
  pick: string;
  match: string;
  league: string;
  date: string;
  odds: number;
  prob: number;
  source: string;
};

export type SavedParlay = {
  id: string;
  savedAt: string;
  plan: string;
  odds: number;
  chance: number;
  status: SavedStatus;
  picks: SavedPick[];
};

const KEY = "saved-parlays-v1";

export function loadSaved(): SavedParlay[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function storeSaved(list: SavedParlay[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage can be blocked (private windows); saving then just doesn't persist
  }
}

// The same picks in the same matches count as the same parlay.
export const signature = (picks: Pick<SavedPick, "match" | "pick">[]) =>
  picks
    .map((p) => `${p.match}|${p.pick}`)
    .sort()
    .join("#");

export function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
