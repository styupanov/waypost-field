import "server-only";
import type { RoutePoint, RouteResponse, TimedRouteResponse } from "@/types/route";
import { HERE_ROUTING_URL, HereRoutingError, requestHereJson, type HereRequestOptions } from "./here-client.ts";
import { normalizeHerePlanningResponse } from "./here-normalization.ts";
import { normalizeHereTimedPlanningResponse } from "./here-timed-normalization.ts";

function validPoint(point: RoutePoint) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
    point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
}

function planningRouteUrl(locations: RoutePoint[], timed: boolean) {
  const url = new URL(HERE_ROUTING_URL);
  url.searchParams.set("transportMode", "car");
  url.searchParams.set("origin", `${locations[0].lat},${locations[0].lon}`);
  url.searchParams.set("destination", `${locations.at(-1)!.lat},${locations.at(-1)!.lon}`);
  for (const point of locations.slice(1, -1)) url.searchParams.append("via", `${point.lat},${point.lon}`);
  url.searchParams.set("return", timed ? "polyline,summary,actions" : "polyline,summary");
  url.searchParams.set("spans", timed ? "duration,carAttributes,streetAttributes" : "carAttributes,streetAttributes");
  url.searchParams.set("departureTime", "any");
  return url;
}

function validateLocations(locations: RoutePoint[]) {
  if (locations.length < 2 || locations.some((point) => !validPoint(point))) {
    throw new HereRoutingError("INVALID_WAYPOINTS", "The route contains invalid waypoints.", 400);
  }
}

export async function calculateHerePlanningRoute(locations: RoutePoint[], options: HereRequestOptions = {}): Promise<RouteResponse> {
  validateLocations(locations);
  const url = planningRouteUrl(locations, false);
  const payload = await requestHereJson(url, {}, options);
  try {
    return normalizeHerePlanningResponse(payload);
  } catch {
    throw new HereRoutingError("HERE_INVALID_RESPONSE", "HERE returned an incomplete planning route.", 502);
  }
}

export async function calculateHereTimedRoute(locations: RoutePoint[], options: HereRequestOptions = {}): Promise<TimedRouteResponse> {
  validateLocations(locations);
  const payload = await requestHereJson(planningRouteUrl(locations, true), {}, options);
  try {
    return normalizeHereTimedPlanningResponse(payload, locations.length);
  } catch {
    throw new HereRoutingError("HERE_INVALID_RESPONSE", "HERE returned incomplete route timing data.", 502);
  }
}
