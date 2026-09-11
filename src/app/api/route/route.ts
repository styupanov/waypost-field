import { NextResponse } from "next/server";
import { routingProvider, RoutingProviderError } from "@/lib/routing/provider";
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
    return NextResponse.json(await routingProvider.route(body.locations));
  } catch (reason) {
    if (reason instanceof RoutingProviderError) {
      console.error("Route generation failed.");
      return NextResponse.json({ error: "Routing request failed." }, { status: reason.statusCode });
    }
    console.error("Unexpected route API error.");
    return NextResponse.json({ error: "Internal routing error." }, { status: 500 });
  }
}
