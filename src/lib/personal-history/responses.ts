import "server-only";
import { loadTraveledRoutes, loadVisitedPlaces } from "./repository.ts";
import { parseHistoryViewport } from "../../types/personal-history.ts";

export async function traveledRoutesResponse(userId: string | null, request: Request) {
  if (!userId) return Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 });
  try {
    const routes = await loadTraveledRoutes(userId, parseHistoryViewport(request.url));
    return Response.json({ routeKind: "inferred_traveled", source: "route_geometry_inferred", routeCount: routes.length, features: { type: "FeatureCollection", features: routes.map((geometry) => ({ type: "Feature", properties: {}, geometry })) } });
  } catch { return Response.json({ error: { code: "HISTORY_UNAVAILABLE" } }, { status: 400 }); }
}

export async function visitedPlacesResponse(userId: string | null, request: Request) {
  if (!userId) return Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 });
  try {
    const places = await loadVisitedPlaces(userId, parseHistoryViewport(request.url));
    return Response.json({ kind: "visited_places", count: places.length, places });
  } catch { return Response.json({ error: { code: "HISTORY_UNAVAILABLE" } }, { status: 400 }); }
}
