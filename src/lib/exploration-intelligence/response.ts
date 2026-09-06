import "server-only";
import { getAreaExplorationIntelligence } from "./service.ts";
import { parseAreaIntelligenceQuery } from "./validation.ts";

export async function areaExplorationResponse(userId: string | null, request: Request) {
  if (!userId) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in is required." } }, { status: 401 });
  const query = parseAreaIntelligenceQuery(request.url);
  if (!query) return Response.json({ error: { code: "INVALID_AREA", message: "The selected area is invalid." } }, { status: 400 });
  try { return Response.json(await getAreaExplorationIntelligence({ userId, ...query })); }
  catch { console.error("Area exploration intelligence could not be loaded."); return Response.json({ error: { code: "AREA_INTELLIGENCE_UNAVAILABLE", message: "Area information is unavailable." } }, { status: 500 }); }
}
