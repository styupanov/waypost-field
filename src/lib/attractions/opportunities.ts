import "server-only";
import { findAttractionCandidates, findDatasetMeanRating } from "@/lib/attractions/candidates";
import { deduplicateAttractionCandidates } from "@/lib/attractions/deduplication";
import {
  calculateOpportunityScore,
  MAX_DETOUR_DISTANCE_KM,
  MAX_DETOUR_DURATION_SECONDS,
  shortlistCandidates,
  type ScoredCandidate,
} from "@/lib/attractions/scoring";
import { routingProvider } from "@/lib/routing/provider";
import { personalizeOpportunities } from "@/lib/attractions/personalization";
import type { AttractionOpportunitiesResponse, AttractionOpportunity } from "@/types/attractions";
import type { RoutePoint, RouteResponse, RouteSummary } from "@/types/route";
import type { TripPreferences } from "@/types/preferences";

export const ROUTING_VALIDATION_CONCURRENCY = 5;
export const ATTRACTION_SCORING_POOL_LIMIT = 5_000;
// Eight retains the existing day-planning breadth while bounding paid exact routes.
export const ATTRACTION_EXACT_VALIDATION_LIMIT = 8;

export type OpportunityQuery = {
  locations: RoutePoint[];
  route: { type: "LineString"; coordinates: [number, number][] };
  corridorMeters: number;
  preferences: TripPreferences;
};

export type OpportunityOptions = {
  baselineRoute?: RouteResponse;
  validationLimit?: number;
};

export type OpportunityDependencies = {
  findCandidates: typeof findAttractionCandidates;
  findMeanRating: typeof findDatasetMeanRating;
  calculateRoute: typeof routingProvider.route;
  calculateMatrix: typeof routingProvider.matrix;
};

const defaultDependencies: OpportunityDependencies = {
  findCandidates: findAttractionCandidates,
  findMeanRating: findDatasetMeanRating,
  calculateRoute: routingProvider.route,
  calculateMatrix: routingProvider.matrix,
};

function squaredDistance(left: RoutePoint, right: RoutePoint) {
  const latScale = Math.cos(((left.lat + right.lat) / 2) * (Math.PI / 180));
  const lon = (left.lon - right.lon) * latScale;
  const lat = left.lat - right.lat;
  return lon * lon + lat * lat;
}

export function insertAttractionPreservingStops(locations: RoutePoint[], attraction: RoutePoint) {
  let insertionIndex = 1;
  let smallestAddedDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < locations.length - 1; index += 1) {
    const before = locations[index];
    const after = locations[index + 1];
    const addedDistance = Math.sqrt(squaredDistance(before, attraction)) +
      Math.sqrt(squaredDistance(attraction, after)) - Math.sqrt(squaredDistance(before, after));
    if (addedDistance < smallestAddedDistance) {
      smallestAddedDistance = addedDistance;
      insertionIndex = index + 1;
    }
  }
  return [...locations.slice(0, insertionIndex), attraction, ...locations.slice(insertionIndex)];
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function buildOpportunity(candidate: ScoredCandidate, baseline: RouteSummary, candidateSummary: RouteSummary): AttractionOpportunity | null {
  const rawDistance = candidateSummary.distanceKm - baseline.distanceKm;
  const rawDuration = candidateSummary.durationSeconds - baseline.durationSeconds;
  const detourWasClamped = rawDistance < 0 || rawDuration < 0;
  const detourDistanceKm = Math.max(0, rawDistance);
  const detourDurationSeconds = Math.max(0, rawDuration);
  if (detourDistanceKm > MAX_DETOUR_DISTANCE_KM || detourDurationSeconds > MAX_DETOUR_DURATION_SECONDS) return null;

  return {
    attraction: {
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      lat: candidate.lat,
      lon: candidate.lon,
      duration: candidate.duration,
    },
    distanceToRouteMeters: candidate.distanceToRouteMeters,
    qualityScore: candidate.qualityScore,
    detourDistanceKm,
    detourDurationSeconds,
    detourWasClamped,
    score: calculateOpportunityScore(candidate.qualityScore, detourDistanceKm, detourDurationSeconds),
  };
}

export async function findAttractionOpportunitiesWithDependencies(
  { locations, route, corridorMeters, preferences }: OpportunityQuery,
  options: OpportunityOptions,
  dependencies: OpportunityDependencies
): Promise<AttractionOpportunitiesResponse> {
  const [candidateResult, datasetMeanRating] = await Promise.all([
    dependencies.findCandidates({
      route,
      corridorMeters,
      limit: ATTRACTION_SCORING_POOL_LIMIT,
    }),
    dependencies.findMeanRating(),
  ]);
  const deduplicated = deduplicateAttractionCandidates(
    candidateResult.candidates
  );
  const shortlist = shortlistCandidates(
    deduplicated.candidates,
    datasetMeanRating,
    corridorMeters
  );
  if (shortlist.length === 0) {
    return {
      opportunities: [],
      candidateRoutesEvaluated: 0,
      diagnostics: {
        corridorCandidateCount: candidateResult.totalCount,
        candidateCountConsidered: candidateResult.candidates.length,
        candidatesAfterDeduplication:
          deduplicated.candidateCountAfterDedup,
        duplicatesRemoved: deduplicated.duplicatesRemoved,
        shortlistSize: 0,
        candidatePoolTruncated: candidateResult.truncated,
        matrixRequestCount: 0,
        matrixSucceeded: false,
        matrixReachableCandidateCount: 0,
        exactValidationLimit: ATTRACTION_EXACT_VALIDATION_LIMIT,
      },
    };
  }

  const baseline = options.baselineRoute ?? (await dependencies.calculateRoute(locations));
  const candidatePoints = shortlist.map((candidate) => ({ lat: candidate.lat, lon: candidate.lon }));
  let matrixRequestCount = 2;
  let matrixSucceeded = false;
  let matrixReachableCandidateCount = shortlist.length;
  let ranked = shortlist;
  try {
    const [outbound, inbound] = await Promise.all([
      dependencies.calculateMatrix([locations[0]], candidatePoints),
      dependencies.calculateMatrix(candidatePoints, [locations.at(-1)!]),
    ]);
    ranked = shortlist.flatMap((candidate, index) => {
      const toCandidate = outbound[0]?.[index];
      const fromCandidate = inbound[index]?.[0];
      if (!toCandidate || !fromCandidate) return [];
      const distance = Math.max(0, toCandidate.distanceKm + fromCandidate.distanceKm - baseline.summary.distanceKm);
      const duration = Math.max(0, toCandidate.durationSeconds + fromCandidate.durationSeconds - baseline.summary.durationSeconds);
      return [{ candidate, estimate: calculateOpportunityScore(candidate.qualityScore, distance, duration) }];
    }).sort((left, right) => right.estimate - left.estimate || right.candidate.qualityScore - left.candidate.qualityScore || left.candidate.id - right.candidate.id)
      .map(({ candidate }) => candidate);
    matrixSucceeded = true;
    matrixReachableCandidateCount = ranked.length;
  } catch {
    // Preserve the quality shortlist as a bounded fallback when matrix routing fails.
    matrixRequestCount = 2;
    matrixReachableCandidateCount = 0;
  }
  const requestedLimit = options.validationLimit ?? ATTRACTION_EXACT_VALIDATION_LIMIT;
  const exactValidationLimit = Math.max(0, Math.min(ATTRACTION_EXACT_VALIDATION_LIMIT, requestedLimit));
  const validationPool = ranked.slice(0, exactValidationLimit);
  const evaluated = await mapWithConcurrency(validationPool, ROUTING_VALIDATION_CONCURRENCY, async (candidate) => {
    const candidateLocations = insertAttractionPreservingStops(locations, { lat: candidate.lat, lon: candidate.lon });
    const candidateRoute = await dependencies.calculateRoute(candidateLocations);
    return buildOpportunity(candidate, baseline.summary, candidateRoute.summary);
  });

  return {
    opportunities: personalizeOpportunities(
      evaluated
      .filter((value): value is AttractionOpportunity => value !== null)
      .sort((left, right) => right.score - left.score || left.attraction.id - right.attraction.id),
      preferences
    ),
    candidateRoutesEvaluated: validationPool.length,
    diagnostics: {
      corridorCandidateCount: candidateResult.totalCount,
      candidateCountConsidered: candidateResult.candidates.length,
      candidatesAfterDeduplication:
        deduplicated.candidateCountAfterDedup,
      duplicatesRemoved: deduplicated.duplicatesRemoved,
      shortlistSize: shortlist.length,
      candidatePoolTruncated: candidateResult.truncated,
      matrixRequestCount,
      matrixSucceeded,
      matrixReachableCandidateCount,
      exactValidationLimit,
    },
  };
}

export function findAttractionOpportunities(query: OpportunityQuery, options: OpportunityOptions = {}) {
  return findAttractionOpportunitiesWithDependencies(query, options, defaultDependencies);
}
