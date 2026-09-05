import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { startTrip, TripLifecycleError } from "@/lib/trips/lifecycle";

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return error("UNAUTHORIZED", "Sign in is required.", 401);
  try {
    const { tripId } = await context.params;
    return NextResponse.json(await startTrip(userId, tripId));
  } catch (reason) {
    if (reason instanceof TripLifecycleError) {
      return error(reason.code, reason.message, reason.code === "TRIP_NOT_FOUND" ? 404 : 409);
    }
    console.error("Failed to start owned trip.");
    return error("TRIP_LIFECYCLE_FAILED", "The trip could not be started.", 500);
  }
}
