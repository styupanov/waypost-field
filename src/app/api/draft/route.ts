import { NextResponse } from "next/server";
import { AttractionQueryError, DatabaseConnectionError } from "@/lib/attractions/candidates";
import { DatabaseConfigurationError } from "@/lib/db/postgres";
import { RoutingServiceError } from "@/lib/routing/valhalla";
import { composeTripDraft } from "@/lib/trip/composition";
import { parseTripPreferences } from "@/lib/trip/preferences-validation";
import type { DraftEndpoint } from "@/types/trip";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { assertTripOwnership, saveOwnedCurrentDraftVersion } from "@/lib/trips/repository";
import { TripPersistenceError } from "@/lib/trips/repository";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEndpoint(value: unknown): DraftEndpoint | null {
  if (!isRecord(value) || !isRecord(value.coordinates)) return null;
  const { label, coordinates } = value;
  const { lat, lon } = coordinates;
  if (
    typeof label !== "string" || !label.trim() ||
    typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180
  ) return null;
  return { label: label.trim(), coordinates: { lat, lon } };
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_DRAFT_REQUEST", "Request body must be valid JSON.", 400);
  }
  if (!isRecord(body)) {
    return errorResponse("INVALID_DRAFT_REQUEST", "Valid trip endpoints and preferences are required.", 400);
  }

  const origin = parseEndpoint(body.origin);
  const stop = body.stop === null || body.stop === undefined
    ? null
    : parseEndpoint(body.stop);
  const destination = parseEndpoint(body.destination);
  const preferences = parseTripPreferences(body.preferences);
  const ownedTripId = typeof body.ownedTripId === "string" ? body.ownedTripId : null;
  if (!origin || (body.stop !== null && body.stop !== undefined && !stop) || !destination || !preferences) {
    return errorResponse("INVALID_DRAFT_REQUEST", "Valid trip endpoints and preferences are required.", 400);
  }

  try {
    let userId: string | null = null;
    if (ownedTripId) {
      userId = await authenticatedWaypostUserId();
      if (!userId) return errorResponse("UNAUTHORIZED", "Sign in is required.", 401);
      await assertTripOwnership(userId, ownedTripId);
    }
    const draft = await composeTripDraft({ origin, stop, destination, preferences });
    if (ownedTripId && userId) await saveOwnedCurrentDraftVersion(userId, ownedTripId, draft);
    return NextResponse.json(draft);
  } catch (reason) {
    if (reason instanceof TripPersistenceError && reason.code === "TRIP_NOT_FOUND") {
      return errorResponse("TRIP_NOT_FOUND", "Trip was not found.", 404);
    }
    if (reason instanceof DatabaseConfigurationError) {
      console.error("Draft attraction database is not configured.");
      return errorResponse("DATABASE_NOT_CONFIGURED", "Draft composition is not configured.", 500);
    }
    if (reason instanceof DatabaseConnectionError) {
      console.error("Draft attraction database connection failed.");
      return errorResponse("DATABASE_UNAVAILABLE", "Draft composition is temporarily unavailable.", 503);
    }
    if (reason instanceof AttractionQueryError) {
      console.error("Draft attraction query failed.");
      return errorResponse("ATTRACTION_QUERY_FAILED", "The personalized draft could not be generated.", 500);
    }
    if (reason instanceof RoutingServiceError) {
      console.error("Draft routing failed.");
      return errorResponse("ROUTING_UNAVAILABLE", "The personalized draft route could not be generated.", reason.statusCode);
    }
    console.error("Unexpected draft composition error.");
    return errorResponse("DRAFT_COMPOSITION_FAILED", "The personalized draft could not be generated.", 500);
  }
}
