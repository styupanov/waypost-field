import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { reconstructTripDraft } from "@/lib/trips/reconstruction";
import { getFinalizedTripWorkspace, getOwnedTrip } from "@/lib/trips/repository";

export async function GET(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in is required." } }, { status: 401 });
  try {
    const { tripId } = await context.params;
    const trip = await getOwnedTrip(userId, tripId);
    if (!trip) return NextResponse.json({ error: { code: "TRIP_NOT_FOUND", message: "Trip was not found." } }, { status: 404 });
    const finalization = trip.status === "draft" ? null : await getFinalizedTripWorkspace(userId, trip.id);
    return NextResponse.json({ tripId: trip.id, tripStatus: trip.status, startedAt: trip.startedAt, endedAt: trip.endedAt, travelConfirmationAt: trip.travelConfirmationAt, versionState: trip.currentVersion?.state ?? null, draft: reconstructTripDraft(trip), finalization });
  } catch (error) {
    console.error("Failed to load owned trip.", error);
    return NextResponse.json({ error: { code: "TRIP_LOAD_FAILED", message: "The trip could not be loaded." } }, { status: 500 });
  }
}
