import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { createTripWithDraft, listTripsForUser } from "@/lib/trips/repository";
import type { TripDraft } from "@/types/trip";

export async function GET() {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in is required." } }, { status: 401 });
  try {
    return NextResponse.json({ trips: await listTripsForUser(userId) });
  } catch (error) {
    console.error("Failed to list owned trips.", error);
    return NextResponse.json({ error: { code: "TRIP_LIST_FAILED", message: "Saved trips could not be loaded." } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in is required." } }, { status: 401 });
  try {
    const body = await request.json() as { draft?: TripDraft };
    if (!body.draft) return NextResponse.json({ error: { code: "INVALID_TRIP", message: "A coherent trip draft is required." } }, { status: 400 });
    const trip = await createTripWithDraft(userId, body.draft);
    return NextResponse.json({ tripId: trip?.id });
  } catch (error) {
    console.error("Failed to create owned trip.", error);
    return NextResponse.json({ error: { code: "TRIP_SAVE_FAILED", message: "The trip could not be saved." } }, { status: 500 });
  }
}
