import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { changeOvernight, OvernightEditError } from "@/lib/overnights/editing";
import { RoutingServiceError } from "@/lib/routing/valhalla";
import { assertTripOwnership, saveOwnedCurrentDraftVersion, TripPersistenceError } from "@/lib/trips/repository";
import type { TripDraft } from "@/types/trip";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { draft?: TripDraft; nightIndex?: number; geonameId?: number; ownedTripId?: string | null };
    if (!body.draft || !Number.isSafeInteger(body.nightIndex) || !Number.isSafeInteger(body.geonameId)) return NextResponse.json({ error: { code: "INVALID_OVERNIGHT_EDIT", message: "A valid overnight change is required." } }, { status: 400 });
    let userId: string | null = null;
    if (body.ownedTripId) { userId = await authenticatedWaypostUserId(); if (!userId) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }); const ownedTrip = await assertTripOwnership(userId, body.ownedTripId); if (ownedTrip.currentVersion?.state !== "draft") return NextResponse.json({ error: { code: "FINALIZED_VERSION_IMMUTABLE", message: "A finalized trip version cannot be changed." } }, { status: 409 }); }
    const draft = await changeOvernight(body.draft, body.nightIndex!, body.geonameId!);
    if (body.ownedTripId && userId) await saveOwnedCurrentDraftVersion(userId, body.ownedTripId, draft);
    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof TripPersistenceError && error.code === "TRIP_NOT_FOUND") return NextResponse.json({ error: { code: "TRIP_NOT_FOUND" } }, { status: 404 });
    if (error instanceof OvernightEditError) return NextResponse.json({ error: { code: "OVERNIGHT_EDIT_CONFLICT", message: error.message } }, { status: 400 });
    if (error instanceof RoutingServiceError) return NextResponse.json({ error: { code: "ROUTING_UNAVAILABLE" } }, { status: error.statusCode });
    console.error("Overnight change failed.", error); return NextResponse.json({ error: { code: "OVERNIGHT_EDIT_FAILED" } }, { status: 500 });
  }
}
