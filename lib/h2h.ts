import type { Match } from "@/lib/football";

// Facts about one fixture, from the point of view of `teamId`.
// "At the ground" = past meetings where the same team was at home as in the
// coming match, newest first, up to 5, however long ago.
export function headToHead(
  meetings: Match[],
  teamId: number,
  oppName: string,
  teamIsHome: boolean,
) {
  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date));
  const homeTeamId = teamIsHome
    ? teamId
    : (sorted.find((m) => m.home.id !== teamId)?.home.id ?? -1);
  const atGround = sorted.filter((m) => m.home.id === homeTeamId).slice(0, 5);

  const facts: string[] = [];
  const n = atGround.length;
  if (n === 0)
    return { facts: ["No past meetings at this ground in the data"], atGround };

  const outcome = (m: Match) => {
    const gf = m.home.id === teamId ? m.homeGoals : m.awayGoals;
    const ga = m.home.id === teamId ? m.awayGoals : m.homeGoals;
    return gf > ga ? "W" : gf < ga ? "L" : "D";
  };
  const count = (f: (m: Match) => boolean) => atGround.filter(f).length;
  const wins = count((m) => outcome(m) === "W");
  const draws = count((m) => outcome(m) === "D");
  const losses = n - wins - draws;
  const where = teamIsHome ? "at home" : "away";

  facts.push(
    `Last ${n} meetings at this ground: won ${wins}, drew ${draws}, lost ${losses}`,
  );
  if (n >= 2) {
    if (wins === 0 && losses === n) {
      facts.push(
        `Lost all ${n} ${teamIsHome ? "home games" : "visits"} against ${oppName}`,
      );
    } else if (wins === 0) {
      facts.push(
        `Hasn't beaten ${oppName} ${where} in the last ${n} meetings here`,
      );
    } else if (wins === n) {
      facts.push(
        `Won all ${n} ${teamIsHome ? "home games" : "visits"} against ${oppName}`,
      );
    } else if (losses === 0) {
      facts.push(`Unbeaten ${where} against ${oppName} in the last ${n} here`);
    }
  }

  const total = (m: Match) => m.homeGoals + m.awayGoals;
  const over15 = count((m) => total(m) >= 2);
  const over25 = count((m) => total(m) >= 3);
  const btts = count((m) => m.homeGoals > 0 && m.awayGoals > 0);
  if (n >= 3 && over15 === n)
    facts.push(`More than 1.5 goals in all of the last ${n} meetings here`);
  if (n >= 3 && over25 >= n - 1)
    facts.push(`Over 2.5 goals in ${over25} of the last ${n} meetings here`);
  if (n >= 3 && n - over25 >= n - 1)
    facts.push(
      `Under 2.5 goals in ${n - over25} of the last ${n} meetings here`,
    );
  if (n >= 3 && btts >= n - 1)
    facts.push(`Both teams scored in ${btts} of the last ${n} meetings here`);
  if (n >= 3 && btts <= 1)
    facts.push(
      `Both teams scored in only ${btts} of the last ${n} meetings here`,
    );

  return { facts, atGround };
}
