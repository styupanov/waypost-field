import type { RouteTimingSegment, TimedRouteResponse } from "../../types/route.ts";
import { decodeFlexiblePolyline, normalizeHerePlanningResponse } from "./here-normalization.ts";

type HereAction = { duration?: unknown };
type HereSpan = { offset?: unknown; duration?: unknown };
type HerePlace = { waypoint?: unknown };
type HereSection = {
  polyline?: unknown;
  summary?: { duration?: unknown };
  spans?: HereSpan[];
  preActions?: HereAction[];
  postActions?: HereAction[];
  arrival?: { place?: HerePlace };
};
type HerePayload = { routes?: { sections?: HereSection[] }[] };

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function actionDuration(actions: HereAction[] | undefined) {
  let total = 0;
  for (const action of actions ?? []) {
    if (action.duration === undefined) continue;
    if (!nonNegative(action.duration)) throw new Error("HERE returned an invalid pre/post action duration.");
    total += action.duration;
  }
  return total;
}

function appendSegment(segments: RouteTimingSegment[], beginShapeIndex: number, endShapeIndex: number, duration: number, elapsed: { value: number }) {
  if (!Number.isSafeInteger(beginShapeIndex) || !Number.isSafeInteger(endShapeIndex) || beginShapeIndex < 0 || endShapeIndex < beginShapeIndex || !nonNegative(duration)) {
    throw new Error("HERE returned an invalid timing segment.");
  }
  const beginTimeSeconds = elapsed.value;
  elapsed.value += duration;
  segments.push({ beginShapeIndex, endShapeIndex, beginTimeSeconds, endTimeSeconds: elapsed.value });
}

export function normalizeHereTimedPlanningResponse(payload: unknown, waypointCount: number): TimedRouteResponse {
  if (!Number.isSafeInteger(waypointCount) || waypointCount < 2) throw new Error("Invalid waypoint count.");
  const sections = (payload as HerePayload | null)?.routes?.[0]?.sections;
  if (!sections?.length) throw new Error("HERE returned no route sections.");

  const route = normalizeHerePlanningResponse(payload);
  const timingSegments: RouteTimingSegment[] = [];
  const waypointArrivalSeconds = new Array<number>(waypointCount);
  waypointArrivalSeconds[0] = 0;
  const elapsed = { value: 0 };
  let globalCoordinateCount = 0;
  let nextViaIndex = 0;

  for (const section of sections) {
    if (typeof section.polyline !== "string" || !section.summary || !nonNegative(section.summary.duration) || !Array.isArray(section.spans) || section.spans.length === 0) {
      throw new Error("HERE returned incomplete section timing data.");
    }
    const coordinates = decodeFlexiblePolyline(section.polyline);
    if (coordinates.length < 2) throw new Error("HERE returned invalid timed geometry.");
    const routeCoordinates = route.route.geometry.coordinates;
    const localToGlobal = coordinates.map((coordinate) => {
      const previous = routeCoordinates[globalCoordinateCount - 1];
      if (previous?.[0] === coordinate[0] && previous[1] === coordinate[1]) return globalCoordinateCount - 1;
      const index = globalCoordinateCount;
      globalCoordinateCount += 1;
      return index;
    });
    const sectionStart = localToGlobal[0];
    const sectionEnd = localToGlobal.at(-1)!;

    const spans = section.spans.map((span) => {
      if (!Number.isSafeInteger(span.offset) || (span.offset as number) < 0 || (span.offset as number) >= coordinates.length || !nonNegative(span.duration)) {
        throw new Error("HERE returned an invalid timing span.");
      }
      return { offset: span.offset as number, duration: span.duration };
    });
    if (spans[0].offset !== 0 || spans.some((span, index) => index > 0 && span.offset <= spans[index - 1].offset)) {
      throw new Error("HERE timing span offsets are not strictly increasing from zero.");
    }

    const sectionStartedAt = elapsed.value;
    const preDuration = actionDuration(section.preActions);
    if (preDuration > 0) appendSegment(timingSegments, sectionStart, sectionStart, preDuration, elapsed);
    for (const [index, span] of spans.entries()) {
      const endOffset = index + 1 < spans.length ? spans[index + 1].offset : coordinates.length - 1;
      appendSegment(timingSegments, localToGlobal[span.offset], localToGlobal[endOffset], span.duration, elapsed);
    }
    const postDuration = actionDuration(section.postActions);
    if (postDuration > 0) appendSegment(timingSegments, sectionEnd, sectionEnd, postDuration, elapsed);

    const representedDuration = elapsed.value - sectionStartedAt;
    const residual = section.summary.duration - representedDuration;
    if (residual < -1e-6) throw new Error("HERE section timing exceeds its summary duration.");
    // Summary-only time has no polyline extent. Keep it at the section endpoint so
    // elapsed time remains exact without inventing movement along the geometry.
    if (residual > 0) appendSegment(timingSegments, sectionEnd, sectionEnd, residual, elapsed);

    const marker = section.arrival?.place?.waypoint;
    if (marker !== undefined) {
      if (!Number.isSafeInteger(marker) || marker !== nextViaIndex || nextViaIndex >= waypointCount - 2) {
        throw new Error("HERE returned invalid waypoint ordering.");
      }
      waypointArrivalSeconds[nextViaIndex + 1] = elapsed.value;
      nextViaIndex += 1;
    }
  }

  if (globalCoordinateCount !== route.route.geometry.coordinates.length || nextViaIndex !== waypointCount - 2) {
    throw new Error("HERE route sections do not cover the requested waypoints.");
  }
  waypointArrivalSeconds[waypointCount - 1] = elapsed.value;
  if (Math.abs(elapsed.value - route.summary.durationSeconds) > 1e-6 ||
    timingSegments.some((segment, index) => segment.endShapeIndex >= globalCoordinateCount || segment.endTimeSeconds < segment.beginTimeSeconds ||
      (index > 0 && segment.beginTimeSeconds !== timingSegments[index - 1].endTimeSeconds))) {
    throw new Error("HERE route timing does not reconcile with route geometry and duration.");
  }
  return { ...route, timingSegments, waypointArrivalSeconds };
}
