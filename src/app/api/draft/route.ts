import { NextResponse } from "next/server";
import { composeTripDraft } from "@/lib/trip/composition";
import { classifyDraftCompositionFailure } from "@/lib/trip/draft-api-errors";
import { parseTripPreferences } from "@/lib/trip/preferences-validation";
import type { DraftEndpoint, DraftOvernightStop, DraftUserAttractionStop } from "@/types/trip";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { assertTripOwnership, saveOwnedCurrentDraftVersion } from "@/lib/trips/repository";

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
  const hardUserAttractions = Array.isArray(body.hardUserAttractions)
    ? body.hardUserAttractions.filter((stop): stop is DraftUserAttractionStop => isRecord(stop) && stop.source === "user_attraction")
    : [];
  const existingUserOvernights = Array.isArray(body.existingUserOvernights)
    ? body.existingUserOvernights.filter((item): item is DraftOvernightStop => isRecord(item) && item.type === "overnight" && item.source === "user")
    : [];
  const previousSelectedTripDays = typeof body.previousSelectedTripDays === "number" ? body.previousSelectedTripDays : null;
  if (!origin || (body.stop !== null && body.stop !== undefined && !stop) || !destination || !preferences) {
    return errorResponse("INVALID_DRAFT_REQUEST", "Valid trip endpoints and preferences are required.", 400);
  }

  try {
    let userId: string | null = null;
    if (ownedTripId) {
      userId = await authenticatedWaypostUserId();
      if (!userId) return errorResponse("UNAUTHORIZED", "Sign in is required.", 401);
      const ownedTrip = await assertTripOwnership(userId, ownedTripId);
      if (ownedTrip.currentVersion?.state !== "draft") return errorResponse("FINALIZED_VERSION_IMMUTABLE", "A finalized trip version cannot be changed.", 409);
    }
    const draft = await composeTripDraft({ origin, stop, destination, preferences, hardUserAttractions, existingUserOvernights, previousSelectedTripDays });
    if (ownedTripId && userId) await saveOwnedCurrentDraftVersion(userId, ownedTripId, draft);
    return NextResponse.json(draft);
  } catch (reason) {
    const failure = classifyDraftCompositionFailure(reason);
    if (failure.logMessage) {
      if (failure.diagnostic) console.error(failure.logMessage, failure.diagnostic);
      else console.error(failure.logMessage);
    }
    return errorResponse(failure.code, failure.message, failure.status);
  }
}
