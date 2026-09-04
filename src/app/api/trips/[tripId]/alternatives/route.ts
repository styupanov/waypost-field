import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { reconstructTripDraft, refreshTripAlternatives } from "@/lib/trips/reconstruction";
import { getOwnedTrip } from "@/lib/trips/repository";

export async function POST(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  try {
    const { tripId } = await context.params;
    const trip = await getOwnedTrip(userId, tripId);
    if (!trip) return NextResponse.json({ error: { code: "TRIP_NOT_FOUND" } }, { status: 404 });
    return NextResponse.json({ alternatives: await refreshTripAlternatives(reconstructTripDraft(trip)) });
  } catch (error) {
    console.error("Failed to refresh saved-trip alternatives.", error);
    return NextResponse.json({ error: { code: "ALTERNATIVES_FAILED" } }, { status: 500 });
  }
}
