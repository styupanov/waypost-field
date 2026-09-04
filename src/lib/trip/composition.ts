import "server-only";
import { normalizeAttractionName } from "@/lib/attractions/deduplication";
import { findAttractionOpportunities } from "@/lib/attractions/opportunities";
import { calculateRoute } from "@/lib/routing/valhalla";
import type { PersonalizedAttractionOpportunity } from "@/types/attractions";
import type {
  DraftEndpoint,
  DraftStop,
  TripAlternative,
  TripDraft,
} from "@/types/trip";
import type { TripPreferences } from "@/types/preferences";
import type { RouteFeature, RoutePoint, RouteResponse } from "@/types/route";

export const COMPOSITION_CORRIDOR_METERS = 25_000;
export const DRIVING_DETOUR_BUDGET_RATIO = 0.15;
export const MAX_DRIVING_DETOUR_SECONDS = 3 * 60 * 60;
export const MIN_PERSONALIZED_SCORE = 60;
export const DISTRIBUTION_BONUS_WEIGHT = 10;
export const TRIP_ALTERNATIVE_LIMIT = 12;

type DraftCompositionRequest = {
  origin: DraftEndpoint;
  stop: DraftEndpoint | null;
  destination: DraftEndpoint;
  preferences: TripPreferences;
};

type PositionedOpportunity = PersonalizedAttractionOpportunity & {
  routeProgress: number;
};

function toRadians(value: number) {
  return value * (Math.PI / 180);
}

function distanceMeters(left: [number, number], right: [number, number]) {
  const earthRadiusMeters = 6_371_008.8;
  const latitudeDelta = toRadians(right[1] - left[1]);
  const longitudeDelta = toRadians(right[0] - left[0]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(left[1])) *
      Math.cos(toRadians(right[1])) *
      Math.sin(longitudeDelta / 2) ** 2;
  const bounded = Math.min(1, Math.max(0, haversine));
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(bounded));
}

export function calculateRouteProgress(
  route: RouteFeature,
  point: RoutePoint
) {
  const coordinates = route.geometry.coordinates;
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const length = distanceMeters(coordinates[index], coordinates[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }
  if (totalLength === 0) return 0;

  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  let closestProgressMeters = 0;
  let traversedMeters = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const referenceLatitude = toRadians((start[1] + end[1] + point.lat) / 3);
    const scale = Math.cos(referenceLatitude);
    const startX = start[0] * scale;
    const startY = start[1];
    const endX = end[0] * scale;
    const endY = end[1];
    const pointX = point.lon * scale;
    const pointY = point.lat;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const fraction = lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0,
          ((pointX - startX) * deltaX + (pointY - startY) * deltaY) /
            lengthSquared
        ));
    const projectedX = startX + fraction * deltaX;
    const projectedY = startY + fraction * deltaY;
    const projectedDistanceSquared =
      (pointX - projectedX) ** 2 + (pointY - projectedY) ** 2;
    if (projectedDistanceSquared < closestDistanceSquared) {
      closestDistanceSquared = projectedDistanceSquared;
      closestProgressMeters =
        traversedMeters + segmentLengths[index] * fraction;
    }
    traversedMeters += segmentLengths[index];
  }
  return closestProgressMeters / totalLength;
}

export function targetPoiCount(durationSeconds: number) {
  const hours = durationSeconds / 3600;
  if (hours < 3) return 1;
  if (hours <= 8) return 2;
  if (hours <= 16) return 3;
  if (hours <= 24) return 4;
  return 5;
}

function selectDistributedOpportunities(
  positioned: PositionedOpportunity[],
  maximum: number
) {
  const selected: PositionedOpportunity[] = [];

  while (selected.length < maximum) {
    const selectedNames = new Set(
      selected.map((opportunity) =>
        normalizeAttractionName(opportunity.attraction.name)
      )
    );
    const available = positioned.filter(
      (opportunity) =>
        !selected.includes(opportunity) &&
        !selectedNames.has(normalizeAttractionName(opportunity.attraction.name))
    );
    if (available.length === 0) break;

    const progressAnchors = [0, 1, ...selected.map((item) => item.routeProgress)];
    available.sort((left, right) => {
      const leftSeparation = Math.min(
        ...progressAnchors.map((progress) => Math.abs(left.routeProgress - progress))
      );
      const rightSeparation = Math.min(
        ...progressAnchors.map((progress) => Math.abs(right.routeProgress - progress))
      );
      const leftValue = left.personalizedScore + leftSeparation * DISTRIBUTION_BONUS_WEIGHT;
      const rightValue = right.personalizedScore + rightSeparation * DISTRIBUTION_BONUS_WEIGHT;
      return rightValue - leftValue || right.personalizedScore - left.personalizedScore || left.attraction.id - right.attraction.id;
    });
    selected.push(available[0]);
  }
  return selected;
}

function toAlternative(
  opportunity: PositionedOpportunity
): TripAlternative {
  return {
    attractionId: opportunity.attraction.id,
    name: opportunity.attraction.name,
    coordinates: {
      lat: opportunity.attraction.lat,
      lon: opportunity.attraction.lon,
    },
    rawCategory: opportunity.attraction.category,
    interestCategory: opportunity.attraction.interestCategory,
    rating: opportunity.attraction.rating,
    reviewCount: opportunity.attraction.reviewCount,
    routeProgress: opportunity.routeProgress,
    personalizedScore: opportunity.personalizedScore,
    individualDetourDistanceKm: opportunity.detourDistanceKm,
    individualDetourDurationSeconds: opportunity.detourDurationSeconds,
    duration: opportunity.attraction.duration,
    visitDuration: opportunity.attraction.visitDuration,
  };
}

function weakestOpportunity(selected: PositionedOpportunity[]) {
  return [...selected].sort((left, right) => {
    const otherProgress = (candidate: PositionedOpportunity) =>
      selected
        .filter((item) => item !== candidate)
        .map((item) => Math.abs(candidate.routeProgress - item.routeProgress));
    const leftDistances = otherProgress(left);
    const rightDistances = otherProgress(right);
    const leftDistribution = leftDistances.length ? Math.min(...leftDistances) : 0;
    const rightDistribution = rightDistances.length ? Math.min(...rightDistances) : 0;
    const leftValue = left.personalizedScore + leftDistribution * DISTRIBUTION_BONUS_WEIGHT;
    const rightValue = right.personalizedScore + rightDistribution * DISTRIBUTION_BONUS_WEIGHT;
    return leftValue - rightValue || left.attraction.id - right.attraction.id;
  })[0];
}

function waypointSequence(
  request: DraftCompositionRequest,
  selected: PositionedOpportunity[],
  baselineRoute: RouteFeature
) {
  const entries: {
    progress: number;
    point: RoutePoint;
    stop: DraftStop;
    tieBreaker: number;
  }[] = selected.map((opportunity) => ({
    progress: opportunity.routeProgress,
    point: { lat: opportunity.attraction.lat, lon: opportunity.attraction.lon },
    stop: {
      source: "waypost",
      attractionId: opportunity.attraction.id,
      label: opportunity.attraction.name,
      coordinates: {
        lat: opportunity.attraction.lat,
        lon: opportunity.attraction.lon,
      },
      category: opportunity.attraction.category,
      interestCategory: opportunity.attraction.interestCategory,
      rating: opportunity.attraction.rating,
      reviewCount: opportunity.attraction.reviewCount,
      duration: opportunity.attraction.duration,
      visitDuration: opportunity.attraction.visitDuration,
      routeProgress: opportunity.routeProgress,
      personalizedScore: opportunity.personalizedScore,
      individualDetourDistanceKm: opportunity.detourDistanceKm,
      individualDetourDurationSeconds: opportunity.detourDurationSeconds,
    },
    tieBreaker: opportunity.attraction.id,
  }));

  if (request.stop) {
    entries.push({
      progress: calculateRouteProgress(baselineRoute, request.stop.coordinates),
      point: request.stop.coordinates,
      stop: { ...request.stop, source: "user" },
      tieBreaker: -1,
    });
  }
  entries.sort(
    (left, right) =>
      left.progress - right.progress || left.tieBreaker - right.tieBreaker
  );
  return {
    locations: [
      request.origin.coordinates,
      ...entries.map((entry) => entry.point),
      request.destination.coordinates,
    ],
    stops: entries.map((entry) => entry.stop),
  };
}

export function suggestedVisitDuration(stops: DraftStop[]) {
  let minimumMinutes = 0;
  let maximumMinutes: number | null = 0;
  let hasUnknown = false;
  for (const stop of stops) {
    if (stop.source !== "waypost") continue;
    const duration = stop.visitDuration;
    if (!duration) {
      hasUnknown = true;
      continue;
    }
    if (duration.minimumMinutes === null) hasUnknown = true;
    else minimumMinutes += duration.minimumMinutes;
    if (duration.maximumMinutes === null) {
      maximumMinutes = null;
      hasUnknown = true;
    } else if (maximumMinutes !== null) {
      maximumMinutes += duration.maximumMinutes;
    }
  }
  return { minimumMinutes, maximumMinutes, hasUnknown };
}

export async function composeTripDraft(
  request: DraftCompositionRequest
): Promise<TripDraft> {
  const hardLocations = [
    request.origin.coordinates,
    ...(request.stop ? [request.stop.coordinates] : []),
    request.destination.coordinates,
  ];
  const baseline = await calculateRoute(hardLocations);
  const target = targetPoiCount(baseline.summary.durationSeconds);
  const detourBudgetSeconds = Math.min(
    baseline.summary.durationSeconds * DRIVING_DETOUR_BUDGET_RATIO,
    MAX_DRIVING_DETOUR_SECONDS
  );
  const opportunityResult = await findAttractionOpportunities(
    {
      locations: hardLocations,
      route: baseline.route.geometry,
      corridorMeters: COMPOSITION_CORRIDOR_METERS,
      preferences: request.preferences,
    },
    { baselineRoute: baseline }
  );

  const positioned = opportunityResult.opportunities
    .filter((opportunity) =>
      opportunity.personalizedScore >= MIN_PERSONALIZED_SCORE
    )
    .map((opportunity) => ({
      ...opportunity,
      routeProgress: calculateRouteProgress(baseline.route, {
        lat: opportunity.attraction.lat,
        lon: opportunity.attraction.lon,
      }),
    }));
  let selected = selectDistributedOpportunities(positioned, target);
  let finalRoute: RouteResponse = baseline;
  let finalStops: DraftStop[] = request.stop
    ? [{ ...request.stop, source: "user" }]
    : [];
  let actualDetourSeconds = 0;
  let actualDetourWasClamped = false;
  let compositionRouteCalls = 0;

  while (selected.length > 0) {
    const sequence = waypointSequence(request, selected, baseline.route);
    const composed = await calculateRoute(sequence.locations);
    compositionRouteCalls += 1;
    const rawDetour =
      composed.summary.durationSeconds - baseline.summary.durationSeconds;
    actualDetourWasClamped = rawDetour < 0;
    actualDetourSeconds = Math.max(0, rawDetour);
    if (actualDetourSeconds <= detourBudgetSeconds) {
      finalRoute = composed;
      finalStops = sequence.stops;
      break;
    }
    const weakest = weakestOpportunity(selected);
    selected = selected.filter((opportunity) => opportunity !== weakest);
  }

  if (selected.length === 0) {
    finalRoute = baseline;
    actualDetourSeconds = 0;
    actualDetourWasClamped = false;
  }

  const selectedAttractionIds = new Set(
    selected.map((opportunity) => opportunity.attraction.id)
  );
  const alternatives = positioned
    .filter(
      (opportunity) =>
        !selectedAttractionIds.has(opportunity.attraction.id)
    )
    .slice(0, TRIP_ALTERNATIVE_LIMIT)
    .map(toAlternative);

  return {
    origin: request.origin,
    stop: request.stop,
    destination: request.destination,
    baselineSummary: baseline.summary,
    route: finalRoute.route,
    summary: finalRoute.summary,
    stops: finalStops,
    preferences: request.preferences,
    alternatives,
    lastEdit: null,
    composition: {
      targetPoiCount: target,
      selectedPoiCount: selected.length,
      detourBudgetSeconds,
      actualDetourSeconds,
      actualDetourWasClamped,
      valhallaCallCount:
        1 + opportunityResult.candidateRoutesEvaluated + compositionRouteCalls,
      corridorCandidateCount:
        opportunityResult.diagnostics.corridorCandidateCount,
      candidateCountConsidered:
        opportunityResult.diagnostics.candidateCountConsidered,
      candidatesAfterDeduplication:
        opportunityResult.diagnostics.candidatesAfterDeduplication,
      opportunityShortlistSize: opportunityResult.diagnostics.shortlistSize,
      candidatePoolTruncated:
        opportunityResult.diagnostics.candidatePoolTruncated,
      suggestedVisitDuration: suggestedVisitDuration(finalStops),
    },
  };
}
