import "server-only";
import type { RouteFeature, RoutePoint, RouteResponse, RouteTimingSegment, TimedRouteResponse } from "@/types/route";

const LOCAL_VALHALLA_URL = "http://localhost:8002";

type ValhallaManeuver = { time?: unknown; begin_shape_index?: unknown; end_shape_index?: unknown };
type ValhallaLeg = { shape?: unknown; maneuvers?: ValhallaManeuver[]; summary?: { time?: unknown } };
type ValhallaResponse = {
  trip?: {
    legs?: ValhallaLeg[];
    summary?: {
      length?: unknown;
      time?: unknown;
      has_toll?: unknown;
      has_highway?: unknown;
      has_ferry?: unknown;
    };
  };
};

type ValhallaMatrixCell = { time?: unknown; distance?: unknown; from_index?: unknown; to_index?: unknown };
type ValhallaMatrixResponse = { sources_to_targets?: ValhallaMatrixCell[][] };
export type RouteMatrixCell = { durationSeconds: number; distanceKm: number } | null;

export class RoutingServiceError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "RoutingServiceError";
    this.statusCode = statusCode;
  }
}

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
      if (index >= encoded.length) throw new RoutingServiceError("Valhalla returned invalid route geometry.");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) throw new RoutingServiceError("Valhalla returned invalid route geometry.");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lon / factor, lat / factor]);
  }

  return coordinates;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function requestRoute(locations: RoutePoint[], includeTiming: boolean): Promise<RouteResponse | TimedRouteResponse> {
  const baseUrl = process.env.VALHALLA_URL ?? LOCAL_VALHALLA_URL;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations, costing: "auto", units: "kilometers" }),
    });
  } catch {
    throw new RoutingServiceError("The routing service could not be reached.", 503);
  }

  if (!response.ok) {
    throw new RoutingServiceError("The routing service rejected the route request.", response.status >= 500 ? 503 : 502);
  }

  let data: ValhallaResponse;
  try {
    data = (await response.json()) as ValhallaResponse;
  } catch {
    throw new RoutingServiceError("The routing service returned invalid data.");
  }

  const legs = data.trip?.legs;
  const summary = data.trip?.summary;
  if (!legs?.length || !summary || !isFiniteNumber(summary.length) || !isFiniteNumber(summary.time)) {
    throw new RoutingServiceError("The routing service returned an incomplete route.");
  }

  const coordinates: [number, number][] = [];
  const timingSegments: RouteTimingSegment[] = [];
  const waypointArrivalSeconds = [0];
  let cumulativeTime = 0;
  for (const leg of legs) {
    if (typeof leg.shape !== "string") throw new RoutingServiceError("The routing service returned invalid geometry.");
    const legCoordinates = decodePolyline(leg.shape);
    const shapeOffset = coordinates.length === 0 ? 0 : coordinates.length - 1;
    if (coordinates.length > 0) legCoordinates.shift();
    coordinates.push(...legCoordinates);
    if (includeTiming) {
      for (const maneuver of leg.maneuvers ?? []) {
        if (!isFiniteNumber(maneuver.time) || !isFiniteNumber(maneuver.begin_shape_index) || !isFiniteNumber(maneuver.end_shape_index)) continue;
        timingSegments.push({ beginShapeIndex: shapeOffset + maneuver.begin_shape_index, endShapeIndex: shapeOffset + maneuver.end_shape_index, beginTimeSeconds: cumulativeTime, endTimeSeconds: cumulativeTime + maneuver.time });
        cumulativeTime += maneuver.time;
      }
      waypointArrivalSeconds.push(cumulativeTime);
    }
  }

  const route: RouteFeature = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  };
  const result: RouteResponse = {
    route,
    summary: {
      distanceKm: summary.length,
      durationSeconds: summary.time,
      hasToll: summary.has_toll === true,
      hasHighway: summary.has_highway === true,
      hasFerry: summary.has_ferry === true,
    },
  };
  if (!includeTiming) return result;
  if (timingSegments.length === 0) throw new RoutingServiceError("Valhalla returned no route timing data.");
  return { ...result, timingSegments, waypointArrivalSeconds };
}

export async function calculateRoute(locations: RoutePoint[]): Promise<RouteResponse> {
  return requestRoute(locations, false) as Promise<RouteResponse>;
}

export async function calculateTimedRoute(locations: RoutePoint[]): Promise<TimedRouteResponse> {
  return requestRoute(locations, true) as Promise<TimedRouteResponse>;
}

export async function calculateMatrix(sources: RoutePoint[], targets: RoutePoint[]): Promise<RouteMatrixCell[][]> {
  const baseUrl = process.env.VALHALLA_URL ?? LOCAL_VALHALLA_URL;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/sources_to_targets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources, targets, costing: "auto", units: "kilometers" }) });
  } catch { throw new RoutingServiceError("The routing matrix service could not be reached.", 503); }
  if (!response.ok) throw new RoutingServiceError("The routing matrix service rejected the request.", response.status >= 500 ? 503 : 502);
  let data: ValhallaMatrixResponse;
  try { data = await response.json() as ValhallaMatrixResponse; } catch { throw new RoutingServiceError("The routing matrix service returned invalid data."); }
  if (!Array.isArray(data.sources_to_targets) || data.sources_to_targets.length !== sources.length) throw new RoutingServiceError("The routing matrix service returned an incomplete matrix.");
  return data.sources_to_targets.map((row) => targets.map((_, targetIndex) => {
    const cell = row?.[targetIndex];
    return cell && isFiniteNumber(cell.time) && isFiniteNumber(cell.distance) ? { durationSeconds: cell.time, distanceKm: cell.distance } : null;
  }));
}

export type RouteMatrixTimings = { outboundMatrixMs: number; inboundMatrixMs: number; matrixWallClockMs: number };

export async function calculateReturnTripMatrix(origin: RoutePoint, destinations: RoutePoint[], timings?: RouteMatrixTimings) {
  if (!destinations.length) return [];
  const wallStarted = performance.now();
  const measured = async (direction: "outboundMatrixMs" | "inboundMatrixMs", sources: RoutePoint[], targets: RoutePoint[]) => {
    const started = performance.now();
    try { return await calculateMatrix(sources, targets); }
    finally { if (timings) timings[direction] = performance.now() - started; }
  };
  const [outbound, inbound] = await Promise.all([
    measured("outboundMatrixMs", [origin], destinations),
    measured("inboundMatrixMs", destinations, [origin]),
  ]);
  if (timings) timings.matrixWallClockMs = performance.now() - wallStarted;
  return destinations.map((_, index) => ({ outbound: outbound[0]?.[index] ?? null, inbound: inbound[index]?.[0] ?? null }));
}
