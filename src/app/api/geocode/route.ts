import { NextResponse } from "next/server";
import {
  geocodeWithGoogle,
  GoogleGeocodingError,
} from "@/lib/geocoding/google";

type GeocodingRequest = {
  query?: unknown;
};

export async function POST(request: Request) {
  let body: GeocodingRequest;

  try {
    body = (await request.json()) as GeocodingRequest;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_GEOCODING_REQUEST",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 }
    );
  }

  if (typeof body.query !== "string" || body.query.trim() === "") {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_GEOCODING_REQUEST",
          message: "A non-empty query is required.",
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await geocodeWithGoogle(body.query.trim());
    return NextResponse.json(result);
  } catch (reason) {
    if (reason instanceof GoogleGeocodingError) {
      console.error("Geocoding API error:", reason.message);
      return NextResponse.json(
        {
          error: {
            code: reason.code,
            message: reason.message,
          },
        },
        { status: reason.httpStatus }
      );
    }

    console.error("Unexpected geocoding API error:", reason);
    return NextResponse.json(
      {
        error: {
          code: "GEOCODING_SERVICE_ERROR",
          message: "Geocoding failed unexpectedly.",
        },
      },
      { status: 500 }
    );
  }
}
