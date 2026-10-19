import { parseLeague } from "@/lib/leagues";
import { getStandings } from "@/lib/standings";

// GET /api/standings?league=PL (defaults to the Premier League)
export async function GET(request: Request) {
  const league = parseLeague(
    new URL(request.url).searchParams.get("league") ?? undefined,
  );
  const result = await getStandings(league);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.table);
}
