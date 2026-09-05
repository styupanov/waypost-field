import type { FinalRoutePreview } from "../../types/final-route.ts";

const FLEXIBLE_POLYLINE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeUnsigned(encoded: string, cursor: { index: number }) {
  let result = 0; let shift = 0;
  while (cursor.index < encoded.length) {
    const value = FLEXIBLE_POLYLINE_ALPHABET.indexOf(encoded[cursor.index++]);
    if (value < 0) throw new Error("Invalid flexible polyline character.");
    result += (value & 0x1f) * 2 ** shift;
    if ((value & 0x20) === 0) return result;
    shift += 5;
    if (shift > 50) throw new Error("Flexible polyline value is too large.");
  }
  throw new Error("Truncated flexible polyline.");
}

function decodeSigned(value: number) { return value & 1 ? -Math.floor(value / 2) - 1 : Math.floor(value / 2); }

export function decodeFlexiblePolyline(encoded: string): [number, number][] {
  const cursor = { index: 0 };
  if (decodeUnsigned(encoded, cursor) !== 1) throw new Error("Unsupported flexible polyline version.");
  const header = decodeUnsigned(encoded, cursor);
  const precision = header & 15;
  const thirdDimension = (header >> 4) & 7;
  const thirdPrecision = (header >> 7) & 15;
  const factor = 10 ** precision; const thirdFactor = 10 ** thirdPrecision;
  let latitude = 0; let longitude = 0;
  const coordinates: [number, number][] = [];
  while (cursor.index < encoded.length) {
    latitude += decodeSigned(decodeUnsigned(encoded, cursor));
    longitude += decodeSigned(decodeUnsigned(encoded, cursor));
    if (thirdDimension !== 0) void (decodeSigned(decodeUnsigned(encoded, cursor)) / thirdFactor);
    coordinates.push([longitude / factor, latitude / factor]);
  }
  return coordinates;
}

type HereSection = { polyline?: unknown; summary?: { length?: unknown; duration?: unknown; baseDuration?: unknown } };
type HerePayload = { routes?: { sections?: HereSection[] }[] };

function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }

export function concatenateSectionCoordinates(sections: [number, number][][]) {
  const coordinates: [number, number][] = [];
  for (const section of sections) for (const point of section) {
    const previous = coordinates.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) coordinates.push(point);
  }
  return coordinates;
}

export function normalizeHereResponse(payload: unknown, waypointCount: number, requestDurationMilliseconds: number): FinalRoutePreview {
  const routes = (payload as HerePayload | null)?.routes;
  const sections = routes?.[0]?.sections;
  if (!sections?.length) throw new Error("HERE returned no route sections.");
  const decodedSections: [number, number][][] = [];
  let lengthMeters = 0; let durationSeconds = 0; let baseDurationSeconds = 0; let hasBaseDuration = true;
  for (const section of sections) {
    if (typeof section.polyline !== "string" || !section.summary || !nonNegative(section.summary.length) || !nonNegative(section.summary.duration)) throw new Error("HERE returned an incomplete route section.");
    const decoded = decodeFlexiblePolyline(section.polyline);
    if (decoded.length < 2) throw new Error("HERE returned invalid route geometry.");
    decodedSections.push(decoded);
    lengthMeters += section.summary.length; durationSeconds += section.summary.duration;
    if (nonNegative(section.summary.baseDuration)) baseDurationSeconds += section.summary.baseDuration;
    else hasBaseDuration = false;
  }
  const coordinates = concatenateSectionCoordinates(decodedSections);
  if (coordinates.length < 2 || !nonNegative(lengthMeters) || !nonNegative(durationSeconds)) throw new Error("HERE returned invalid route totals.");
  return { provider: "here", route: { type: "LineString", coordinates }, summary: { distanceKm: lengthMeters / 1000, durationSeconds, baseDurationSeconds: hasBaseDuration ? baseDurationSeconds : null }, diagnostics: { sectionCount: sections.length, waypointCount, requestDurationMilliseconds } };
}
