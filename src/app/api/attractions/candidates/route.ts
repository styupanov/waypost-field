import { NextResponse } from "next/server";
import {
  AttractionQueryError,
  DatabaseConnectionError,
  findAttractionCandidates,
} from "@/lib/attractions/candidates";
import { DatabaseConfigurationError } from "@/lib/db/postgres";

const MAX_CORRIDOR_METERS = 100_000;

type ValidCandidateRequest = {
  route: {
    type: "LineString";
    coordinates: [number, number][];
  };
  corridorMeters: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateRequest(body: unknown): ValidCandidateRequest | null {
  if (!isRecord(body) || !isRecord(body.route)) {
    return null;
  }

  const { route, corridorMeters } = body;

  if (
    route.type !== "LineString" ||
    !Array.isArray(route.coordinates) ||
    route.coordinates.length < 2 ||
    typeof corridorMeters !== "number" ||
    !Number.isFinite(corridorMeters) ||
    corridorMeters <= 0 ||
    corridorMeters > MAX_CORRIDOR_METERS
  ) {
    return null;
  }

  const coordinates: [number, number][] = [];

  for (const coordinate of route.coordinates) {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2 ||
      typeof coordinate[0] !== "number" ||
      !Number.isFinite(coordinate[0]) ||
      coordinate[0] < -180 ||
      coordinate[0] > 180 ||
      typeof coordinate[1] !== "number" ||
      !Number.isFinite(coordinate[1]) ||
      coordinate[1] < -90 ||
      coordinate[1] > 90
    ) {
      return null;
    }

    coordinates.push([coordinate[0], coordinate[1]]);
  }

  return {
    route: { type: "LineString", coordinates },
    corridorMeters,
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
    return errorResponse(
      "INVALID_CANDIDATE_REQUEST",
      "Request body must be valid JSON.",
      400
    );
  }

  const candidateRequest = validateRequest(body);

  if (!candidateRequest) {
    return errorResponse(
      "INVALID_CANDIDATE_REQUEST",
      "A valid LineString and corridor between 0 and 100000 meters are required.",
      400
    );
  }

  try {
    const result = await findAttractionCandidates(candidateRequest);
    return NextResponse.json(result);
  } catch (reason) {
    if (reason instanceof DatabaseConfigurationError) {
      console.error("Attraction database is not configured.");
      return errorResponse(
        "DATABASE_NOT_CONFIGURED",
        "The attraction data service is not configured.",
        500
      );
    }

    if (reason instanceof DatabaseConnectionError) {
      console.error("Attraction database connection failed.");
      return errorResponse(
        "DATABASE_UNAVAILABLE",
        "The attraction data service is temporarily unavailable.",
        503
      );
    }

    if (reason instanceof AttractionQueryError) {
      console.error("Attraction candidate query failed.");
      return errorResponse(
        "ATTRACTION_QUERY_FAILED",
        "Attraction candidates could not be generated.",
        500
      );
    }

    console.error("Unexpected attraction candidate error.");
    return errorResponse(
      "ATTRACTION_QUERY_FAILED",
      "Attraction candidates could not be generated.",
      500
    );
  }
}
