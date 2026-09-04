import { NextResponse } from "next/server";
import { findOvernightCandidates } from "@/lib/overnights/candidates";
import { RoutingServiceError } from "@/lib/routing/valhalla";
import type { TripDraft } from "@/types/trip";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { draft?: TripDraft };
    if (!body.draft?.multiDay || !Array.isArray(body.draft.stops)) return NextResponse.json({ error: { code: "INVALID_OVERNIGHT_REQUEST", message: "A generated multi-day draft is required." } }, { status: 400 });
    const nightIndex = Number.isSafeInteger((body as { nightIndex?: number }).nightIndex) ? (body as { nightIndex: number }).nightIndex : undefined;
    return NextResponse.json(await findOvernightCandidates(body.draft, nightIndex));
  } catch (error) {
    if (error instanceof RoutingServiceError) return NextResponse.json({ error: { code: "ROUTING_UNAVAILABLE", message: "Overnight candidates could not be routed." } }, { status: error.statusCode });
    console.error("Overnight candidate generation failed.", error);
    return NextResponse.json({ error: { code: "OVERNIGHT_CANDIDATES_FAILED", message: "Overnight candidates could not be generated." } }, { status: 500 });
  }
}
