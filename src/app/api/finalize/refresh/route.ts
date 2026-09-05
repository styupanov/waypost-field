import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { HereRoutingError } from "@/lib/routing/here";
import { refreshFinalRoute } from "@/lib/trips/final-route-refresh";
import { TripPersistenceError } from "@/lib/trips/repository";

function error(code: string, message: string, status: number) { return NextResponse.json({ error: { code, message } }, { status }); }
function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function POST(request: Request) {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return error("AUTH_REQUIRED", "Sign in is required.", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return error("INVALID_REFRESH_REQUEST", "Request body must be valid JSON.", 400); }
  if (!body || typeof body !== "object" || !isUuid((body as { tripId?: unknown }).tripId)) return error("INVALID_REFRESH_REQUEST", "A valid trip ID is required.", 400);
  try { return NextResponse.json(await refreshFinalRoute(userId, (body as { tripId: string }).tripId)); }
  catch (reason) {
    if (reason instanceof HereRoutingError) return error("HERE_ROUTE_REFRESH_FAILED", "The final HERE route could not be refreshed.", reason.statusCode);
    if (reason instanceof TripPersistenceError) {
      if (reason.code === "TRIP_NOT_FOUND") return error("TRIP_NOT_FOUND", "Trip was not found.", 404);
      if (reason.code === "TRIP_NOT_FINALIZED" || reason.code === "FINALIZATION_PROVIDER_UNSUPPORTED") return error(reason.code, reason.message, 409);
    }
    console.error("Final route cache refresh failed.");
    return error("HERE_ROUTE_REFRESH_FAILED", "The final HERE route could not be refreshed.", 500);
  }
}
