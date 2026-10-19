import { getHeadToHead } from "@/lib/football";

// GET /api/h2h?match=560614 -> past meetings of the two teams in that fixture
export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("match"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Bad match id" }, { status: 400 });
  }
  const result = await getHeadToHead(id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data);
}
