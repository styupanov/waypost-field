import "server-only";
import type { RoutePoint, RouteResponse } from "@/types/route";
import { HERE_ROUTING_URL, HereRoutingError, requestHereJson, type HereRequestOptions } from "./here-client.ts";
import { normalizeHerePlanningResponse } from "./here-normalization.ts";

function validPoint(point: RoutePoint) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
    point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
}

export async function calculateHerePlanningRoute(locations: RoutePoint[], options: HereRequestOptions = {}): Promise<RouteResponse> {
  if (locations.length < 2 || locations.some((point) => !validPoint(point))) {
    throw new HereRoutingError("INVALID_WAYPOINTS", "The route contains invalid waypoints.", 400);
  }
  const url = new URL(HERE_ROUTING_URL);
  url.searchParams.set("transportMode", "car");
  url.searchParams.set("origin", `${locations[0].lat},${locations[0].lon}`);
  url.searchParams.set("destination", `${locations.at(-1)!.lat},${locations.at(-1)!.lon}`);
  for (const point of locations.slice(1, -1)) url.searchParams.append("via", `${point.lat},${point.lon}`);
  url.searchParams.set("return", "polyline,summary");
  url.searchParams.set("spans", "roadAttributes");
  url.searchParams.set("departureTime", "any");
  const payload = await requestHereJson(url, {}, options);
  try {
    return normalizeHerePlanningResponse(payload);
  } catch {
    throw new HereRoutingError("HERE_INVALID_RESPONSE", "HERE returned an incomplete planning route.", 502);
  }
}
