import { NextRequest, NextResponse } from "next/server";

const VALHALLA_URL = process.env.VALHALLA_URL ?? "http://localhost:8002";

type RoutePoint = {
  lat: number;
  lon: number;
};

type RouteRequest = {
  locations: RoutePoint[];
};

function decodePolyline(encoded: string, precision = 6): [number, number][] {
  let index = 0;
  let lat = 0;
  let lon = 0;

  const coordinates: [number, number][] = [];
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat =
      result & 1 ? ~(result >> 1) : result >> 1;

    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLon =
      result & 1 ? ~(result >> 1) : result >> 1;

    lon += deltaLon;

    // GeoJSON expects [longitude, latitude]
    coordinates.push([lon / factor, lat / factor]);
  }

  return coordinates;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RouteRequest;

    if (!body.locations || body.locations.length < 2) {
      return NextResponse.json(
        {
          error: "At least two locations are required.",
        },
        {
          status: 400,
        }
      );
    }

    const valhallaResponse = await fetch(`${VALHALLA_URL}/route`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locations: body.locations,
        costing: "auto",
        units: "kilometers",
      }),
    });

    if (!valhallaResponse.ok) {
      const errorText = await valhallaResponse.text();

      return NextResponse.json(
        {
          error: "Valhalla routing request failed.",
          details: errorText,
        },
        {
          status: valhallaResponse.status,
        }
      );
    }

    const valhallaData = await valhallaResponse.json();

    const legs = valhallaData.trip?.legs;

    if (!legs || legs.length === 0) {
      return NextResponse.json(
        {
          error: "Valhalla returned no route legs.",
        },
        {
          status: 502,
        }
      );
    }

    const coordinates: [number, number][] = [];

    for (const leg of legs) {
      const legCoordinates = decodePolyline(leg.shape);

      // Avoid duplicating the point where two legs connect.
      if (coordinates.length > 0) {
        legCoordinates.shift();
      }

      coordinates.push(...legCoordinates);
    }

    return NextResponse.json({
      route: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates,
        },
      },

      summary: {
        distanceKm: valhallaData.trip.summary.length,
        durationSeconds: valhallaData.trip.summary.time,
        hasToll: valhallaData.trip.summary.has_toll,
        hasHighway: valhallaData.trip.summary.has_highway,
        hasFerry: valhallaData.trip.summary.has_ferry,
      },
    });
  } catch (error) {
    console.error("Route API error:", error);

    return NextResponse.json(
      {
        error: "Internal routing error.",
      },
      {
        status: 500,
      }
    );
  }
}
