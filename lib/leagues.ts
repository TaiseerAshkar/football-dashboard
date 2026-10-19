// Leagues available on the free football-data.org plan.
// (Belgium and Saudi Arabia are not offered by this API at all.)
export const LEAGUES = [
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "BL1", name: "Bundesliga" },
  { code: "SA", name: "Serie A" },
  { code: "FL1", name: "Ligue 1" },
  { code: "PPL", name: "Primeira Liga" },
  { code: "CL", name: "Champions League" },
] as const;

export type LeagueCode = (typeof LEAGUES)[number]["code"];

export function parseLeague(value: string | undefined): LeagueCode {
  return LEAGUES.find((l) => l.code === value)?.code ?? "PL";
}
