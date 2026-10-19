// Matching a team name from one data source to a club in another ("Manchester
// City" in the odds data against "Man City" / "Manchester City FC" in the
// football-data.org results). Used for the "why" lines and for checking results.

const STOP = new Set(["fc", "cf", "afc", "sc", "ac", "as", "ssc", "rc", "ud", "cd", "sv", "vfb", "vfl", "fk", "sk", "de", "the", "club", "calcio", "us"]);

export const tokens = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));

const sameToken = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

// [share of the shorter name that matched, share of the longer name that matched].
// The second number breaks ties, e.g. "Inter Milan" matches both "Inter" and
// "AC Milan" on one word each, but only "Inter" matches both its words.
function similarity(a: string[], b: string[]): [number, number] {
  if (a.length === 0 || b.length === 0) return [0, 0];
  const matched = a.filter((x) => b.some((y) => sameToken(x, y))).length;
  return [matched / Math.min(a.length, b.length), matched / Math.max(a.length, b.length)];
}

// The item whose short or full name best matches, or nothing if unsure or tied.
export function bestMatch<T extends { names: string[] }>(items: T[], name: string): T | undefined {
  const want = tokens(name);
  let best: T | undefined;
  let bestScore: [number, number] = [0, 0];
  let tie = false;
  for (const item of items) {
    let score: [number, number] = [0, 0];
    for (const n of item.names) {
      const s = similarity(want, tokens(n));
      if (s[0] > score[0] || (s[0] === score[0] && s[1] > score[1])) score = s;
    }
    const better = score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1]);
    if (better) {
      best = item;
      bestScore = score;
      tie = false;
    } else if (score[0] === bestScore[0] && score[1] === bestScore[1] && score[0] > 0) {
      tie = true;
    }
  }
  return bestScore[0] >= 0.5 && !tie ? best : undefined;
}
