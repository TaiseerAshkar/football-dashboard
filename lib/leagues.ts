// Leagues available on the free football-data.org plan.
// (Belgium, Saudi Arabia and Israel are not offered by this API.)
//
// `zones` colors the table: the first `top` places, an optional middle band,
// and the last `bottom` places. Only filled in where I'm confident of the rules.
export type Zones = {
  top?: { count: number; label: string };
  mid?: { from: number; to: number; label: string };
  bottom?: { count: number; label: string };
};

export const LEAGUES = [
  {
    code: "PL",
    name: "Premier League",
    zones: { top: { count: 4, label: "Champions League" }, bottom: { count: 3, label: "Relegation" } },
  },
  {
    code: "PD",
    name: "La Liga",
    zones: { top: { count: 4, label: "Champions League" }, bottom: { count: 3, label: "Relegation" } },
  },
  {
    code: "BL1",
    name: "Bundesliga",
    zones: { top: { count: 4, label: "Champions League" }, bottom: { count: 2, label: "Relegation" } },
  },
  {
    code: "SA",
    name: "Serie A",
    zones: { top: { count: 4, label: "Champions League" }, bottom: { count: 3, label: "Relegation" } },
  },
  { code: "FL1", name: "Ligue 1", zones: { bottom: { count: 2, label: "Relegation" } } },
  { code: "PPL", name: "Primeira Liga", zones: { bottom: { count: 2, label: "Relegation" } } },
  { code: "DED", name: "Eredivisie", zones: { bottom: { count: 2, label: "Relegation" } } },
  {
    code: "CL",
    name: "Champions League",
    zones: {
      top: { count: 8, label: "Last 16" },
      mid: { from: 9, to: 24, label: "Play-offs" },
      bottom: { count: 12, label: "Eliminated" },
    },
  },
] as const satisfies readonly { code: string; name: string; zones: Zones }[];

export type LeagueCode = (typeof LEAGUES)[number]["code"];

export function parseLeague(value: string | undefined): LeagueCode {
  return LEAGUES.find((l) => l.code === value)?.code ?? "PL";
}

export type ZoneKind = "top" | "mid" | "bottom";

// Which colored band (if any) a table position falls in.
export function zoneFor(position: number, total: number, zones: Zones): ZoneKind | null {
  if (zones.top && position <= zones.top.count) return "top";
  if (zones.bottom && position > total - zones.bottom.count) return "bottom";
  if (zones.mid && position >= zones.mid.from && position <= zones.mid.to) return "mid";
  return null;
}
