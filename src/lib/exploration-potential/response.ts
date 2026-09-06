import "server-only";
import { getExplorationPotential } from "./service.ts";
import { parsePotentialViewport } from "./validation.ts";

export async function explorationPotentialResponse(userId: string | null, request: Request) {
  if (!userId) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in is required." } }, { status: 401 });
  const input = parsePotentialViewport(request.url);
  if (!input) return Response.json({ error: { code: "INVALID_VIEWPORT", message: "The map viewport is invalid." } }, { status: 400 });
  try { return Response.json(await getExplorationPotential(userId, input.resolution, input)); }
  catch { console.error("Exploration potential could not be loaded."); return Response.json({ error: { code: "POTENTIAL_UNAVAILABLE", message: "Interesting areas are unavailable." } }, { status: 500 }); }
}
