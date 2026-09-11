import "server-only";
import { archiveRawProviderPayload, type RawProviderArchiveInput } from "../aws/raw-provider-archive.ts";
import type { RoutingWaypoint, FinalRoutePreview } from "../../types/final-route.ts";
import type { TripDraft } from "../../types/trip.ts";
import { normalizeHereResponse } from "./here-normalization.ts";
import { HERE_ROUTING_URL, HereRoutingError, requestHereJson } from "./here-client.ts";

export const MAX_FINAL_ROUTE_WAYPOINTS = 50;
export { HERE_TIMEOUT_MILLISECONDS, HereRoutingError } from "./here-client.ts";
export type { HereRoutingErrorCode } from "./here-client.ts";

function validWaypoint(point: RoutingWaypoint) { return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180; }

export function orderedWaypointsFromDraft(draft: TripDraft): RoutingWaypoint[] {
  return [draft.origin.coordinates, ...draft.stops.map((stop) => stop.coordinates), draft.destination.coordinates].map((point) => ({ latitude: point.lat, longitude: point.lon }));
}

export async function calculateHereFinalRoute(waypoints: RoutingWaypoint[], options: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMilliseconds?: number; archiveImpl?: (input: RawProviderArchiveInput) => Promise<void> } = {}): Promise<FinalRoutePreview> {
  if (!(options.apiKey ?? process.env.HERE_API_KEY)) throw new HereRoutingError("HERE_NOT_CONFIGURED", "HERE routing is not configured.", 503);
  if (waypoints.length < 2 || waypoints.some((point) => !validWaypoint(point))) throw new HereRoutingError("INVALID_WAYPOINTS", "The ordered itinerary contains invalid waypoints.", 400);
  if (waypoints.length > MAX_FINAL_ROUTE_WAYPOINTS) throw new HereRoutingError("WAYPOINT_LIMIT_EXCEEDED", `Final route preview supports up to ${MAX_FINAL_ROUTE_WAYPOINTS} waypoints.`, 400);
  const url = new URL(HERE_ROUTING_URL);
  url.searchParams.set("transportMode", "car");
  url.searchParams.set("origin", `${waypoints[0].latitude},${waypoints[0].longitude}`);
  url.searchParams.set("destination", `${waypoints.at(-1)!.latitude},${waypoints.at(-1)!.longitude}`);
  for (const point of waypoints.slice(1, -1)) url.searchParams.append("via", `${point.latitude},${point.longitude}`);
  url.searchParams.set("return", "polyline,summary"); url.searchParams.set("departureTime", "any");
  const started = performance.now();
  const payload = await requestHereJson(url, {}, options, {
    timeout: "HERE route preview timed out.",
    rejected: "HERE routing rejected the preview request.",
    invalid: "HERE returned invalid route data.",
  });
  const fetchedAt = new Date().toISOString();
  const elapsedMilliseconds = performance.now() - started;
  try { await (options.archiveImpl ?? archiveRawProviderPayload)({ provider: "here", domain: "routing", fetchedAt, payload }); }
  catch { console.warn("Raw HERE archive failed; continuing route calculation."); }
  try { return normalizeHereResponse(payload, waypoints.length, elapsedMilliseconds); }
  catch { throw new HereRoutingError("HERE_INVALID_RESPONSE", "HERE returned an incomplete route preview.", 502); }
}
