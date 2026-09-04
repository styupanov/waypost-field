import "server-only";
import { findAttractionCandidates, findDatasetMeanRating } from "@/lib/attractions/candidates";
import {
  calculateOpportunityScore,
  MAX_DETOUR_DISTANCE_KM,
  MAX_DETOUR_DURATION_SECONDS,
  shortlistCandidates,
  type ScoredCandidate,
} from "@/lib/attractions/scoring";
import { calculateRoute } from "@/lib/routing/valhalla";
import type { AttractionOpportunitiesResponse, AttractionOpportunity } from "@/types/attractions";
import type { RoutePoint, RouteSummary } from "@/types/route";

export const VALHALLA_CONCURRENCY = 5;
export const ATTRACTION_SCORING_POOL_LIMIT = 5_000;

export type OpportunityQuery = {
  locations: RoutePoint[];
  route: { type: "LineString"; coordinates: [number, number][] };
  corridorMeters: number;
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

export async function findAttractionOpportunities({ locations, route, corridorMeters }: OpportunityQuery): Promise<AttractionOpportunitiesResponse> {
  const [candidateResult, datasetMeanRating] = await Promise.all([
    findAttractionCandidates({
      route,
      corridorMeters,
      limit: ATTRACTION_SCORING_POOL_LIMIT,
    }),
    findDatasetMeanRating(),
  ]);
  const shortlist = shortlistCandidates(candidateResult.candidates, datasetMeanRating, corridorMeters);
  if (shortlist.length === 0) return { opportunities: [] };

  const baseline = await calculateRoute(locations);
  const evaluated = await mapWithConcurrency(shortlist, VALHALLA_CONCURRENCY, async (candidate) => {
    const candidateLocations = insertAttractionPreservingStops(locations, { lat: candidate.lat, lon: candidate.lon });
    const candidateRoute = await calculateRoute(candidateLocations);
    return buildOpportunity(candidate, baseline.summary, candidateRoute.summary);
  });

  return {
    opportunities: evaluated
      .filter((value): value is AttractionOpportunity => value !== null)
      .sort((left, right) => right.score - left.score || left.attraction.id - right.attraction.id),
  };
}
