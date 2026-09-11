import "server-only";
import type { RoutePoint } from "@/types/route";
import type { RouteMatrixCell } from "./routing-provider.ts";
import { HERE_MATRIX_URL, HereRoutingError, requestHereJson, type HereRequestOptions } from "./here-client.ts";

export const HERE_MATRIX_MAX_LOCATIONS = 25;
export const HERE_MATRIX_PROFILE = "carFast";

type HereMatrix = {
  numOrigins?: unknown;
  numDestinations?: unknown;
  travelTimes?: unknown;
  distances?: unknown;
  errorCodes?: unknown;
};

function normalizedMatrix(payload: unknown, sourceCount: number, targetCount: number): RouteMatrixCell[][] {
  const matrix = (payload as { matrix?: HereMatrix } | null)?.matrix;
  const size = sourceCount * targetCount;
  if (!matrix || matrix.numOrigins !== sourceCount || matrix.numDestinations !== targetCount ||
    !Array.isArray(matrix.travelTimes) || !Array.isArray(matrix.distances) ||
    matrix.travelTimes.length !== size || matrix.distances.length !== size ||
    (matrix.errorCodes !== undefined && (!Array.isArray(matrix.errorCodes) || matrix.errorCodes.length !== size))) {
    throw new HereRoutingError("HERE_INVALID_RESPONSE", "HERE returned an incomplete routing matrix.", 502);
  }
  const travelTimes = matrix.travelTimes as unknown[];
  const distances = matrix.distances as unknown[];
  const errorCodes = matrix.errorCodes as unknown[] | undefined;
  return Array.from({ length: sourceCount }, (_, sourceIndex) =>
    Array.from({ length: targetCount }, (_, targetIndex) => {
      const index = targetCount * sourceIndex + targetIndex;
      const errorCode = errorCodes?.[index];
      const duration = travelTimes[index];
      const distance = distances[index];
      if ((typeof errorCode === "number" && errorCode !== 0) ||
        typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 ||
        typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) return null;
      return { durationSeconds: duration, distanceKm: distance / 1000, sourceIndex, targetIndex };
    })
  );
}

export async function calculateHereMatrix(sources: RoutePoint[], targets: RoutePoint[], options: HereRequestOptions = {}): Promise<RouteMatrixCell[][]> {
  const validPoint = (point: RoutePoint) => Number.isFinite(point.lat) && Number.isFinite(point.lon) && point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
  const supportedShape = (sources.length === 1 && targets.length >= 1 && targets.length <= HERE_MATRIX_MAX_LOCATIONS) ||
    (targets.length === 1 && sources.length >= 1 && sources.length <= HERE_MATRIX_MAX_LOCATIONS);
  if (!supportedShape || sources.some((point) => !validPoint(point)) || targets.some((point) => !validPoint(point))) {
    throw new HereRoutingError("INVALID_WAYPOINTS", "HERE planning matrices require valid 1 x N or N x 1 coordinates with N up to 25.", 400);
  }
  const url = new URL(HERE_MATRIX_URL);
  url.searchParams.set("async", "false");
  const body = {
    origins: sources.map(({ lat, lon }) => ({ lat, lng: lon })),
    destinations: targets.map(({ lat, lon }) => ({ lat, lng: lon })),
    regionDefinition: { type: "world" },
    profile: HERE_MATRIX_PROFILE,
    matrixAttributes: ["travelTimes", "distances"],
  };
  const payload = await requestHereJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, options);
  return normalizedMatrix(payload, sources.length, targets.length);
}
