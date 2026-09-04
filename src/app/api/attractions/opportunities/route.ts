import { NextResponse } from "next/server";
import { AttractionQueryError, DatabaseConnectionError } from "@/lib/attractions/candidates";
import { findAttractionOpportunities, type OpportunityQuery } from "@/lib/attractions/opportunities";
import { DatabaseConfigurationError } from "@/lib/db/postgres";
import { RoutingServiceError } from "@/lib/routing/valhalla";
import type { RoutePoint } from "@/types/route";
import { parseTripPreferences } from "@/lib/trip/preferences-validation";

const MAX_CORRIDOR_METERS = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePoint(value: unknown): RoutePoint | null {
  if (!isRecord(value)) return null;
  const { lat, lon } = value;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function validateRequest(body: unknown): OpportunityQuery | null {
  if (!isRecord(body) || !isRecord(body.route)) return null;
  const { locations, route, corridorMeters } = body;
  const preferences = parseTripPreferences(body.preferences);
  if (!Array.isArray(locations) || locations.length < 2 || route.type !== "LineString" ||
    !Array.isArray(route.coordinates) || route.coordinates.length < 2 ||
    typeof corridorMeters !== "number" || !Number.isFinite(corridorMeters) ||
    corridorMeters <= 0 || corridorMeters > MAX_CORRIDOR_METERS ||
    !preferences) return null;

  const parsedLocations = locations.map(parsePoint);
  if (parsedLocations.some((point) => point === null)) return null;

  const coordinates: [number, number][] = [];
  for (const coordinate of route.coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2 ||
      typeof coordinate[0] !== "number" || !Number.isFinite(coordinate[0]) || coordinate[0] < -180 || coordinate[0] > 180 ||
      typeof coordinate[1] !== "number" || !Number.isFinite(coordinate[1]) || coordinate[1] < -90 || coordinate[1] > 90) return null;
    coordinates.push([coordinate[0], coordinate[1]]);
  }

  return {
    locations: parsedLocations as RoutePoint[],
    route: { type: "LineString", coordinates },
    corridorMeters,
    preferences,
  };
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_OPPORTUNITY_REQUEST", "Request body must be valid JSON.", 400);
  }

  const query = validateRequest(body);
  if (!query) {
    return errorResponse("INVALID_OPPORTUNITY_REQUEST", "Valid locations, LineString route, and corridor are required.", 400);
  }

  try {
    return NextResponse.json(await findAttractionOpportunities(query));
  } catch (reason) {
    if (reason instanceof DatabaseConfigurationError) {
      console.error("Attraction database is not configured.");
      return errorResponse("DATABASE_NOT_CONFIGURED", "The attraction data service is not configured.", 500);
    }
    if (reason instanceof DatabaseConnectionError) {
      console.error("Attraction database connection failed.");
      return errorResponse("DATABASE_UNAVAILABLE", "The attraction data service is temporarily unavailable.", 503);
    }
    if (reason instanceof AttractionQueryError) {
      console.error("Attraction query failed.");
      return errorResponse("ATTRACTION_QUERY_FAILED", "Attraction opportunities could not be generated.", 500);
    }
    if (reason instanceof RoutingServiceError) {
      console.error("Attraction detour routing failed.");
      return errorResponse("ROUTING_UNAVAILABLE", "Attraction detours could not be calculated.", reason.statusCode);
    }
    console.error("Unexpected attraction opportunity error.");
    return errorResponse("OPPORTUNITY_GENERATION_FAILED", "Attraction opportunities could not be generated.", 500);
  }
}
