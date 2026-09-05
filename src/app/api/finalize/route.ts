import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { HereRoutingError } from "@/lib/routing/here";
import { finalizeOwnedTrip, TripFinalizationError } from "@/lib/trips/finalization";
import { TripPersistenceError } from "@/lib/trips/repository";
import { TripCreditError } from "@/lib/credits/repository";

function error(code: string, message: string, status: number) { return NextResponse.json({ error: { code, message } }, { status }); }
function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function POST(request: Request) {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return error("UNAUTHORIZED", "Sign in is required.", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return error("INVALID_FINALIZE_REQUEST", "Request body must be valid JSON.", 400); }
  if (!body || typeof body !== "object" || !isUuid((body as { tripId?: unknown }).tripId)) return error("INVALID_FINALIZE_REQUEST", "A valid trip ID is required.", 400);
  try {
    return NextResponse.json(await finalizeOwnedTrip(userId, (body as { tripId: string }).tripId));
  } catch (reason) {
    if (reason instanceof TripCreditError) return error(reason.code, reason.message, 402);
    if (reason instanceof TripFinalizationError) return error(reason.code, reason.message, 409);
    if (reason instanceof HereRoutingError) return error(reason.code, reason.message, reason.statusCode);
    if (reason instanceof TripPersistenceError) {
      if (reason.code === "TRIP_CHANGED_DURING_FINALIZATION") return error(reason.code, reason.message, 409);
      if (reason.code === "FINALIZED_CACHE_MISSING") return error(reason.code, reason.message, 409);
      if (reason.code === "TRIP_NOT_FOUND") return error("TRIP_NOT_FOUND", "Trip was not found.", 404);
    }
    console.error("Trip finalization failed.");
    return error("FINALIZATION_FAILED", "The trip could not be finalized.", 500);
  }
}
