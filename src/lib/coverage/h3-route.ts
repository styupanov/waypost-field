import { UNITS, greatCircleDistance, latLngToCell } from "h3-js";

export const BASE_H3_RESOLUTION = 10;
export const MAX_SAMPLE_INTERVAL_METERS = 75;
export const COVERAGE_SOURCE = "valhalla_inferred" as const;

export type RouteCoordinate = [number, number];
export type RouteLineString = { type: "LineString"; coordinates: RouteCoordinate[] };

function isCoordinate(value: unknown): value is RouteCoordinate {
  return Array.isArray(value) && value.length >= 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90;
}

export function assertRouteLineString(value: unknown): asserts value is RouteLineString {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "LineString") {
    throw new Error("Route coverage requires a LineString geometry.");
  }
  const coordinates = (value as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(isCoordinate)) {
    throw new Error("Route coverage requires at least two valid LineString coordinates.");
  }
}

function toVector([lon, lat]: RouteCoordinate) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)] as const;
}

function sphericalInterpolate(start: RouteCoordinate, end: RouteCoordinate, fraction: number): RouteCoordinate {
  const a = toVector(start);
  const b = toVector(end);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(dot);
  if (angle < 1e-12) return start;
  const sinAngle = Math.sin(angle);
  const startWeight = Math.sin((1 - fraction) * angle) / sinAngle;
  const endWeight = Math.sin(fraction * angle) / sinAngle;
  const x = startWeight * a[0] + endWeight * b[0];
  const y = startWeight * a[1] + endWeight * b[1];
  const z = startWeight * a[2] + endWeight * b[2];
  return [Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI];
}

export function routeSegmentMeters(start: RouteCoordinate, end: RouteCoordinate) {
  return greatCircleDistance([start[1], start[0]], [end[1], end[0]], UNITS.m);
}

export function densifyRoute(coordinates: RouteCoordinate[], maximumIntervalMeters = MAX_SAMPLE_INTERVAL_METERS) {
  if (!Number.isFinite(maximumIntervalMeters) || maximumIntervalMeters <= 0) throw new Error("Sampling interval must be positive.");
  const sampled: RouteCoordinate[] = [coordinates[0]];
  let totalMeters = 0;
  let maximumSegmentMeters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const distance = routeSegmentMeters(start, end);
    totalMeters += distance;
    maximumSegmentMeters = Math.max(maximumSegmentMeters, distance);
    const parts = Math.max(1, Math.ceil(distance / maximumIntervalMeters));
    for (let part = 1; part <= parts; part += 1) sampled.push(sphericalInterpolate(start, end, part / parts));
  }
  return { sampled, totalMeters, maximumSegmentMeters };
}

export function generateH3RouteCells(route: unknown, resolution = BASE_H3_RESOLUTION) {
  assertRouteLineString(route);
  const densified = densifyRoute(route.coordinates);
  const sampledCells = densified.sampled.map(([lon, lat]) => latLngToCell(lat, lon, resolution));
  return { ...densified, sampledCells, cells: [...new Set(sampledCells)].sort() };
}

export function generateBaseRouteCoverage(route: unknown) {
  return generateH3RouteCells(route, BASE_H3_RESOLUTION);
}
