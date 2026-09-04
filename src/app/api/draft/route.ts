import { NextResponse } from "next/server";
import { AttractionQueryError, DatabaseConnectionError } from "@/lib/attractions/candidates";
import { DatabaseConfigurationError } from "@/lib/db/postgres";
import { RoutingServiceError } from "@/lib/routing/valhalla";
import { composeTripDraft } from "@/lib/trip/composition";
import { parseTripPreferences } from "@/lib/trip/preferences-validation";
import type { DraftEndpoint } from "@/types/trip";

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
  if (!origin || (body.stop !== null && body.stop !== undefined && !stop) || !destination || !preferences) {
    return errorResponse("INVALID_DRAFT_REQUEST", "Valid trip endpoints and preferences are required.", 400);
  }

  try {
    return NextResponse.json(
      await composeTripDraft({ origin, stop, destination, preferences })
    );
  } catch (reason) {
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
