import { getStandings } from "@/lib/standings";

export async function GET() {
  const result = await getStandings();
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.table);
}
