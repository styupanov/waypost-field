import type { AttractionCandidate } from "@/types/attractions";

export const REVIEW_CONFIDENCE_THRESHOLD = 100;
export const MAX_PROXIMITY_BONUS = 8;
export const ATTRACTION_SHORTLIST_SIZE = 25;
export const DETOUR_DISTANCE_PENALTY_PER_KM = 0.1;
export const DETOUR_DURATION_PENALTY_PER_HOUR = 4;
export const MAX_DETOUR_DISTANCE_KM = 200;
export const MAX_DETOUR_DURATION_SECONDS = 3 * 60 * 60;

export type ScoredCandidate = AttractionCandidate & { qualityScore: number };

function round(value: number, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function scoreCandidateQuality(candidate: AttractionCandidate, datasetMeanRating: number, corridorMeters: number) {
  const reviews = Math.max(0, candidate.reviewCount);
  const weightedRating =
    (reviews / (reviews + REVIEW_CONFIDENCE_THRESHOLD)) * candidate.rating +
    (REVIEW_CONFIDENCE_THRESHOLD / (reviews + REVIEW_CONFIDENCE_THRESHOLD)) * datasetMeanRating;
  const ratingScore = Math.max(0, Math.min(100, (weightedRating / 5) * 100));
  const proximityRatio = Math.min(1, Math.max(0, candidate.distanceToRouteMeters / corridorMeters));
  return round(ratingScore + (1 - proximityRatio) * MAX_PROXIMITY_BONUS);
}

export function shortlistCandidates(candidates: AttractionCandidate[], datasetMeanRating: number, corridorMeters: number): ScoredCandidate[] {
  return candidates
    .map((candidate) => ({ ...candidate, qualityScore: scoreCandidateQuality(candidate, datasetMeanRating, corridorMeters) }))
    .sort((left, right) => right.qualityScore - left.qualityScore || left.id - right.id)
    .slice(0, ATTRACTION_SHORTLIST_SIZE);
}

export function calculateOpportunityScore(qualityScore: number, detourDistanceKm: number, detourDurationSeconds: number) {
  return round(qualityScore - detourDistanceKm * DETOUR_DISTANCE_PENALTY_PER_KM -
    (detourDurationSeconds / 3600) * DETOUR_DURATION_PENALTY_PER_HOUR);
}
