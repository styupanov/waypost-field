import { NextResponse } from "next/server";
import { calculateRoute, RoutingServiceError } from "@/lib/routing/valhalla";
import type { RoutePoint } from "@/types/route";

function isValidPoint(value: unknown): value is RoutePoint {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Record<string, unknown>;
  return typeof point.lat === "number" && Number.isFinite(point.lat) &&
    point.lat >= -90 && point.lat <= 90 &&
    typeof point.lon === "number" && Number.isFinite(point.lon) &&
    point.lon >= -180 && point.lon <= 180;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { locations?: unknown };
    if (!Array.isArray(body.locations) || body.locations.length < 2 || !body.locations.every(isValidPoint)) {
      return NextResponse.json({ error: "At least two valid locations are required." }, { status: 400 });
    }
    return NextResponse.json(await calculateRoute(body.locations));
  } catch (reason) {
    if (reason instanceof RoutingServiceError) {
      console.error("Route generation failed.");
      return NextResponse.json({ error: "Valhalla routing request failed." }, { status: reason.statusCode });
    }
    console.error("Unexpected route API error.");
    return NextResponse.json({ error: "Internal routing error." }, { status: 500 });
  }
}
