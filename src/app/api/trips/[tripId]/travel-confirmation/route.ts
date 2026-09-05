import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { confirmTripTravelOutcome, TripLifecycleError, undoTripTravelConfirmation, type TravelConfirmationOutcome } from "@/lib/trips/lifecycle";

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function lifecycleError(reason: unknown) {
  if (reason instanceof TripLifecycleError) return error(reason.code, reason.message, reason.code === "TRIP_NOT_FOUND" ? 404 : 409);
  console.error("Travel confirmation failed.");
  return error("TRAVEL_CONFIRMATION_FAILED", "Travel confirmation could not be updated.", 500);
}

export async function POST(request: Request, context: { params: Promise<{ tripId: string }> }) {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return error("UNAUTHORIZED", "Sign in is required.", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return error("INVALID_TRAVEL_CONFIRMATION", "Request body must be valid JSON.", 400); }
  const outcome = body && typeof body === "object" ? (body as { outcome?: unknown }).outcome : null;
  if (outcome !== "traveled" && outcome !== "not_traveled") return error("INVALID_TRAVEL_CONFIRMATION", "Outcome must be traveled or not_traveled.", 400);
  try {
    const { tripId } = await context.params;
    return NextResponse.json(await confirmTripTravelOutcome(userId, tripId, outcome as TravelConfirmationOutcome));
  } catch (reason) { return lifecycleError(reason); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return error("UNAUTHORIZED", "Sign in is required.", 401);
  try {
    const { tripId } = await context.params;
    return NextResponse.json(await undoTripTravelConfirmation(userId, tripId));
  } catch (reason) { return lifecycleError(reason); }
}
