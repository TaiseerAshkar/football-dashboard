// Shapes shared by the search API and the pages that use it.

export type NextMatch = {
  date: string; // ISO kick-off time
  home: boolean; // true if this team plays at home
  opponent: string;
  competition: string; // "Premier League", "Champions League", ...
};

export type SearchTeam = {
  id: number;
  name: string; // short name, e.g. "Man City"
  full: string; // full name, e.g. "Manchester City FC"
  league: string; // domestic league code, or "CL" if only seen in the Champions League
  leagueName: string;
  form: ("W" | "D" | "L")[]; // last 5 results in any competition, newest first
  next: NextMatch[]; // next 3 matches in any competition
};

export type SearchIndex = { teams: SearchTeam[]; failed: string[] };

export const crestUrl = (id: number) => `https://crests.football-data.org/${id}.png`;
