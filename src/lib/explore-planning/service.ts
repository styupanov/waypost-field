import "server-only";
import { calculateReturnTripMatrix, calculateRoute, type RouteMatrixTimings } from "@/lib/routing/valhalla";
import { mapRawAttractionCategory } from "@/lib/attractions/category-mapping";
import { parseVisitDuration } from "@/lib/attractions/duration";
import { exploreCategoryLabel, findExploreAttractionCandidates, type ExploreAttractionCandidate } from "@/lib/explore-planning/repository";
import { EXPLORE_EXACT_ROUTE_LIMIT, EXPLORE_FALLBACK_ROUTING_CONCURRENCY, EXPLORE_RESULT_LIMIT, EXPLORE_ROUTING_CONCURRENCY, EXPLORE_STATIC_SHORTLIST_SIZE, exploreDrivingBudgetSeconds, exploreRouteFitsBudget, mapWithConcurrency } from "@/lib/explore-planning/domain";
import type { ExploreIdeasResponse, ExplorePlanningRequest, ExploreTripIdea } from "@/types/explore-planning";

type Dependencies = {
  findCandidates: typeof findExploreAttractionCandidates;
  calculateMatrix: typeof calculateReturnTripMatrix;
  calculateExactRoute: typeof calculateRoute;
};
const defaults: Dependencies = { findCandidates: findExploreAttractionCandidates, calculateMatrix: calculateReturnTripMatrix, calculateExactRoute: calculateRoute };

export type ExploreStageTimings = {
  h3BoundaryMs: number; candidateRepositoryMs: number; candidateRowCount: number; candidateShortlistCount: number;
  candidateCanonicalMappingMs: number; candidateFilteringMs: number; candidateStaticScoringMs: number; candidateSortingMs: number; candidateResultMappingMs: number;
  matrixPreparationMs: number; outboundMatrixMs: number; inboundMatrixMs: number; matrixWallClockMs: number;
  exactRouteCallCount: number; sumIndividualExactRouteMs: number; exactRoutingWallClockMs: number;
  resultRankingMs: number;
};

export function emptyExploreStageTimings(): ExploreStageTimings {
  return { h3BoundaryMs: 0, candidateRepositoryMs: 0, candidateRowCount: 0, candidateShortlistCount: 0, candidateCanonicalMappingMs: 0, candidateFilteringMs: 0, candidateStaticScoringMs: 0, candidateSortingMs: 0, candidateResultMappingMs: 0, matrixPreparationMs: 0, outboundMatrixMs: 0, inboundMatrixMs: 0, matrixWallClockMs: 0, exactRouteCallCount: 0, sumIndividualExactRouteMs: 0, exactRoutingWallClockMs: 0, resultRankingMs: 0 };
}

function ideaFrom(candidate: ExploreAttractionCandidate, response: Awaited<ReturnType<typeof calculateRoute>>) {
  return {
    id: String(candidate.id),
    destination: {
      attractionId: candidate.id, name: candidate.name, latitude: candidate.latitude,
      longitude: candidate.longitude, categoryLabel: exploreCategoryLabel(candidate.category),
      rawCategory: candidate.category, interestCategory: mapRawAttractionCategory(candidate.category),
      rating: candidate.rating, reviewCount: candidate.reviewCount, duration: candidate.duration,
      visitDuration: parseVisitDuration(candidate.duration), qualityScore: candidate.qualityScore,
    },
    route: { distanceMeters: Math.round(response.summary.distanceKm * 1000), durationSeconds: response.summary.durationSeconds, provider: "valhalla" as const },
    qualityScore: candidate.qualityScore,
  };
}

export async function generateExploreIdeasWithDependencies(input: ExplorePlanningRequest, dependencies: Dependencies, timings = emptyExploreStageTimings()): Promise<ExploreIdeasResponse> {
  const started = performance.now();
  const pool = await dependencies.findCandidates({ h3Index: input.area.h3Index, interests: input.interests, limit: EXPLORE_STATIC_SHORTLIST_SIZE }, timings);
  timings.candidateRowCount = pool.totalCount; timings.candidateShortlistCount = pool.candidates.length;
  if (pool.totalCount === 0) return { ideas: [], outcome: "no_matching_attractions" };
  const matrixPreparationStarted = performance.now();
  const origin = { lat: input.origin.latitude, lon: input.origin.longitude };
  const destinations = pool.candidates.map((candidate) => ({ lat: candidate.latitude, lon: candidate.longitude }));
  const budget = exploreDrivingBudgetSeconds(input.availableDays, input.drivingPace);
  timings.matrixPreparationMs = performance.now() - matrixPreparationStarted;
  const matrixStarted = performance.now(); const matrixTimings: RouteMatrixTimings = { outboundMatrixMs: 0, inboundMatrixMs: 0, matrixWallClockMs: 0 };
  let matrix: Awaited<ReturnType<typeof calculateReturnTripMatrix>> | null = null;
  let matrixRequestCount = 0;
  try { matrixRequestCount = 2; matrix = await dependencies.calculateMatrix(origin, destinations, matrixTimings); } catch { matrix = null; }
  const matrixLatencyMs = Math.round(performance.now() - matrixStarted);
  timings.outboundMatrixMs = matrixTimings.outboundMatrixMs; timings.inboundMatrixMs = matrixTimings.inboundMatrixMs; timings.matrixWallClockMs = performance.now() - matrixStarted;
  const matrixComplete = matrix?.length === pool.candidates.length && matrix.every((pair) => pair.outbound !== null && pair.inbound !== null);
  let matrixFeasibleCount = 0;
  let matrixOverBudgetCount = 0;
  const candidates = pool.candidates.filter((_, index) => {
    const pair = matrix?.[index];
    if (!pair?.outbound || !pair.inbound) return true;
    const fits = exploreRouteFitsBudget(pair.outbound.durationSeconds + pair.inbound.durationSeconds, budget);
    if (fits) matrixFeasibleCount += 1; else matrixOverBudgetCount += 1;
    return fits;
  });
  const matrixKnownCount = matrixFeasibleCount + matrixOverBudgetCount;

  let routingFailures = 0; let exactOverBudget = 0; let exactRouteCallCount = 0;
  const exactStarted = performance.now();
  const routed: ReturnType<typeof ideaFrom>[] = [];
  const matrixUsable = matrixKnownCount > 0;
  const exactBatchSize = matrixUsable ? EXPLORE_EXACT_ROUTE_LIMIT : EXPLORE_FALLBACK_ROUTING_CONCURRENCY;
  const exactConcurrency = matrixUsable ? EXPLORE_ROUTING_CONCURRENCY : EXPLORE_FALLBACK_ROUTING_CONCURRENCY;
  const exactCandidates = candidates;
  for (let offset = 0; offset < exactCandidates.length && routed.length < EXPLORE_RESULT_LIMIT; offset += exactBatchSize) {
    const batch = exactCandidates.slice(offset, offset + exactBatchSize);
    const batchResults = await mapWithConcurrency(batch, exactConcurrency, async (candidate) => {
      exactRouteCallCount += 1;
      const individualStarted = performance.now();
      try {
        const response = await dependencies.calculateExactRoute([origin, { lat: candidate.latitude, lon: candidate.longitude }, origin]);
        if (!exploreRouteFitsBudget(response.summary.durationSeconds, budget)) { exactOverBudget += 1; return null; }
        return ideaFrom(candidate, response);
      } catch { routingFailures += 1; return null; }
      finally { timings.sumIndividualExactRouteMs += performance.now() - individualStarted; }
    });
    routed.push(...batchResults.filter((idea): idea is NonNullable<typeof idea> => idea !== null));
  }
  const exactRoutingLatencyMs = Math.round(performance.now() - exactStarted);
  timings.exactRouteCallCount = exactRouteCallCount; timings.exactRoutingWallClockMs = performance.now() - exactStarted;
  const rankingStarted = performance.now();
  const ideas = routed.sort((a, b) => b.qualityScore - a.qualityScore || a.route.durationSeconds - b.route.durationSeconds || Number(a.id) - Number(b.id))
    .slice(0, EXPLORE_RESULT_LIMIT).map((idea) => ({ id: idea.id, destination: idea.destination, route: idea.route } satisfies ExploreTripIdea));
  timings.resultRankingMs = performance.now() - rankingStarted;
  console.info("Explore ideas generated", {
    candidates: pool.totalCount, shortlisted: pool.candidates.length, matrixRequestCount, matrixLatencyMs,
    matrixComplete, matrixFeasibleCount, matrixOverBudgetCount, matrixUnknownCount: pool.candidates.length - matrixKnownCount,
    exactRouteCallCount, exactRoutingLatencyMs, routingFailures, exactOverBudget, returned: ideas.length,
    totalLatencyMs: Math.round(performance.now() - started),
  });
  if (ideas.length) return { ideas, outcome: "ideas" };
  if (matrixComplete && matrixOverBudgetCount === pool.candidates.length) return { ideas: [], outcome: "outside_driving_budget" };
  return { ideas: [], outcome: routingFailures === exactRouteCallCount && exactRouteCallCount > 0 ? "routing_failed" : "outside_driving_budget" };
}

export function generateExploreIdeas(input: ExplorePlanningRequest, timings?: ExploreStageTimings): Promise<ExploreIdeasResponse> {
  return generateExploreIdeasWithDependencies(input, defaults, timings);
}
