import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { calculateHereFinalRoute, HereRoutingError, orderedWaypointsFromDraft } from "@/lib/routing/here";
import { reconstructTripDraft } from "@/lib/trips/reconstruction";
import { getOwnedTrip } from "@/lib/trips/repository";
import type { TripDraft } from "@/types/trip";

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function draftShape(value: unknown): value is TripDraft { return record(value) && record(value.origin) && record(value.destination) && Array.isArray(value.stops); }
function error(code: string, message: string, status: number) { return NextResponse.json({ error: { code, message } }, { status }); }

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return error("INVALID_PREVIEW_REQUEST", "Request body must be valid JSON.", 400); }
  if (!record(body)) return error("INVALID_PREVIEW_REQUEST", "A coherent draft or owned trip is required.", 400);
  try {
    let draft: TripDraft;
    if (typeof body.ownedTripId === "string") {
      const userId = await authenticatedWaypostUserId();
      if (!userId) return error("UNAUTHORIZED", "Sign in is required.", 401);
      const trip = await getOwnedTrip(userId, body.ownedTripId);
      if (!trip) return error("TRIP_NOT_FOUND", "Trip was not found.", 404);
      draft = reconstructTripDraft(trip);
    } else if (draftShape(body.draft)) draft = body.draft;
    else return error("INVALID_PREVIEW_REQUEST", "A coherent draft or owned trip is required.", 400);
    const result = await calculateHereFinalRoute(orderedWaypointsFromDraft(draft));
    console.info("HERE final route preview completed.", { provider: result.provider, waypointCount: result.diagnostics.waypointCount, sectionCount: result.diagnostics.sectionCount, distanceKm: result.summary.distanceKm, durationSeconds: result.summary.durationSeconds, baseDurationSeconds: result.summary.baseDurationSeconds, requestDurationMilliseconds: result.diagnostics.requestDurationMilliseconds });
    return NextResponse.json(result);
  } catch (reason) {
    if (reason instanceof HereRoutingError) { console.error("HERE final route preview failed.", { code: reason.code }); return error(reason.code, reason.message, reason.statusCode); }
    console.error("Unexpected final route preview failure.");
    return error("FINAL_ROUTE_PREVIEW_FAILED", "The final route preview could not be generated.", 500);
  }
}
