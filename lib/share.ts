// A shared parlay lives entirely inside its link: the legs are packed into the
// URL (compressed, then made URL-safe), so nothing is stored on a server and
// opening the link shows exactly that bet. The prices are the ones from when it
// was built, and the page says so.

export type SharedPick = {
  pick: string;
  match: string;
  league: string;
  date: string; // ISO kick-off time
  odds: number;
  prob: number;
  source: string;
};

export type SharedParlay = {
  plan: string;
  odds: number;
  chance: number;
  builtAt: string; // ISO time the prices were taken
  picks: SharedPick[];
};

const MAX_LEGS = 30;

// ---- bytes <-> URL-safe text (works in the browser and on the server) ----
const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string) => {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function run(stream: CompressionStream | DecompressionStream, input: Uint8Array) {
  const writer = stream.writable.getWriter();
  writer.write(input as BufferSource);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

// Short arrays instead of named fields keep the link as small as possible.
export async function encodeParlay(p: SharedParlay): Promise<string> {
  const short = [
    1,
    p.plan,
    Math.round(p.odds * 100) / 100,
    Math.round(p.chance * 10000) / 10000,
    Math.floor(new Date(p.builtAt).getTime() / 1000),
    p.picks.map((x) => [
      x.pick,
      x.match,
      x.league,
      Math.floor(new Date(x.date).getTime() / 1000),
      Math.round(x.odds * 100) / 100,
      Math.round(x.prob * 1000) / 1000,
      x.source,
    ]),
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(short));
  try {
    return "z" + toBase64Url(await run(new CompressionStream("deflate-raw"), bytes));
  } catch {
    return "j" + toBase64Url(bytes); // very old browsers: no compression
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

// The link comes from anyone, so every field is checked before it is shown.
export async function decodeParlay(text: string): Promise<SharedParlay | null> {
  try {
    if (text.length > 20000) return null;
    const raw = fromBase64Url(text.slice(1));
    const json = text[0] === "z" ? await run(new DecompressionStream("deflate-raw"), raw) : raw;
    const d = JSON.parse(new TextDecoder().decode(json));
    if (!Array.isArray(d) || d[0] !== 1 || !Array.isArray(d[5])) return null;

    const plan = str(d[1], 20);
    const odds = num(d[2], 1, 100000);
    const chance = num(d[3], 0, 1);
    const builtSec = num(d[4], 0, 4102444800);
    if (!plan || odds === null || chance === null || builtSec === null) return null;
    if (d[5].length < 1 || d[5].length > MAX_LEGS) return null;

    const picks: SharedPick[] = [];
    for (const x of d[5]) {
      if (!Array.isArray(x)) return null;
      const pick = str(x[0], 120);
      const match = str(x[1], 120);
      const league = str(x[2], 60);
      const dateSec = num(x[3], 0, 4102444800);
      const o = num(x[4], 1, 100000);
      const prob = num(x[5], 0, 1);
      const source = str(x[6], 40);
      if (!pick || !match || !league || dateSec === null || o === null || prob === null || !source) return null;
      picks.push({ pick, match, league, date: new Date(dateSec * 1000).toISOString(), odds: o, prob, source });
    }
    return { plan, odds, chance, builtAt: new Date(builtSec * 1000).toISOString(), picks };
  } catch {
    return null;
  }
}

export function riskLabel(chance: number) {
  if (chance >= 0.4) return { label: "Low risk", text: "text-good", bar: "bg-good" };
  if (chance >= 0.15) return { label: "Medium risk", text: "text-warn", bar: "bg-warn" };
  if (chance >= 0.05) return { label: "High risk", text: "text-bad", bar: "bg-bad" };
  return { label: "Very high risk", text: "text-bad", bar: "bg-bad" };
}

// Opens the phone's share sheet on touch devices, and copies the link on a computer.
export async function shareParlay(p: SharedParlay): Promise<"shared" | "copied" | "failed"> {
  const url = `${window.location.origin}/parlay/share?d=${await encodeParlay(p)}`;
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Parlay", text: `Parlay x${p.odds.toFixed(2)}, ${p.picks.length} legs`, url });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "failed"; // they closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    window.prompt("Copy this link:", url);
    return "copied";
  }
}
