import "server-only";
import { normalizeAttractionName } from "@/lib/attractions/deduplication";
import { findAttractionOpportunities } from "@/lib/attractions/opportunities";
import { routingProvider } from "@/lib/routing/provider";
import { calculateRouteProgress, DISTRIBUTION_BONUS_WEIGHT, MIN_PERSONALIZED_SCORE, suggestedVisitDuration, TRIP_ALTERNATIVE_LIMIT } from "@/lib/trip/composition";
import type { PersonalizedAttractionOpportunity } from "@/types/attractions";
import { isAttractionStop, isOvernightStop, type DraftAttractionStop, type DraftDayBoundary, type DraftDayPlan, type DraftStop, type ItineraryStop, type TripAlternative, type TripDraft } from "@/types/trip";
import type { RouteResponse } from "@/types/route";
import { allocateDayQuotas, assignHardStopsToDays, constructDayBoundaries, DAY_LOAD_VISIT_PENALTY_WEIGHT, DAY_OPPORTUNITY_VALIDATION_LIMIT, dayAutoDetourBudget, HARD_ATTRACTION_CAPACITY_PENALTY, knownVisitMinutes, removeWeakestAutomatic } from "@/lib/trip/day-planning";

type PositionedOpportunity = PersonalizedAttractionOpportunity & { routeProgress: number; dayAdjustedScore: number };
type DayContext = {
  dayIndex: number;
  start: DraftDayBoundary;
  end: DraftDayBoundary;
  hardStops: DraftStop[];
  structural: RouteResponse;
  opportunities: PositionedOpportunity[];
  diagnostics: Awaited<ReturnType<typeof findAttractionOpportunities>>["diagnostics"];
  candidateRouteCalls: number;
};

function dayLoadAdjustedScore(opportunity: PersonalizedAttractionOpportunity, structuralDrivingSeconds: number) {
  const visitHours = knownVisitMinutes(opportunity.attraction.visitDuration) / 60;
  const drivingHours = structuralDrivingSeconds / 3600;
  return opportunity.personalizedScore - visitHours * drivingHours * DAY_LOAD_VISIT_PENALTY_WEIGHT;
}

function selectForDay(day: DayContext, maximum: number, usedNames: Set<string>) {
  const selected: PositionedOpportunity[] = [];
  while (selected.length < maximum) {
    const anchors = [0, 1, ...selected.map((item) => item.routeProgress)];
    const available = day.opportunities.filter((item) => !selected.includes(item) && !usedNames.has(normalizeAttractionName(item.attraction.name)));
    if (!available.length) break;
    available.sort((left, right) => {
      const separation = (item: PositionedOpportunity) => Math.min(...anchors.map((anchor) => Math.abs(anchor - item.routeProgress)));
      return (right.dayAdjustedScore + separation(right) * DISTRIBUTION_BONUS_WEIGHT) - (left.dayAdjustedScore + separation(left) * DISTRIBUTION_BONUS_WEIGHT) || right.personalizedScore - left.personalizedScore || left.attraction.id - right.attraction.id;
    });
    selected.push(available[0]);
    usedNames.add(normalizeAttractionName(available[0].attraction.name));
  }
  return selected;
}

function attractionStop(opportunity: PositionedOpportunity, dayIndex: number): DraftAttractionStop {
  return { source: "waypost", attractionId: opportunity.attraction.id, label: opportunity.attraction.name, coordinates: { lat: opportunity.attraction.lat, lon: opportunity.attraction.lon }, category: opportunity.attraction.category, interestCategory: opportunity.attraction.interestCategory, rating: opportunity.attraction.rating, reviewCount: opportunity.attraction.reviewCount, duration: opportunity.attraction.duration, visitDuration: opportunity.attraction.visitDuration, routeProgress: opportunity.routeProgress, personalizedScore: opportunity.personalizedScore, individualDetourDistanceKm: opportunity.detourDistanceKm, individualDetourDurationSeconds: opportunity.detourDurationSeconds, dayIndex };
}

function alternative(opportunity: PositionedOpportunity, route: TripDraft["route"]): TripAlternative {
  return { attractionId: opportunity.attraction.id, name: opportunity.attraction.name, coordinates: { lat: opportunity.attraction.lat, lon: opportunity.attraction.lon }, rawCategory: opportunity.attraction.category, interestCategory: opportunity.attraction.interestCategory, rating: opportunity.attraction.rating, reviewCount: opportunity.attraction.reviewCount, routeProgress: calculateRouteProgress(route, { lat: opportunity.attraction.lat, lon: opportunity.attraction.lon }), personalizedScore: opportunity.personalizedScore, individualDetourDistanceKm: opportunity.detourDistanceKm, individualDetourDurationSeconds: opportunity.detourDurationSeconds, duration: opportunity.attraction.duration, visitDuration: opportunity.attraction.visitDuration };
}

function orderedDayStops(day: DayContext, selected: PositionedOpportunity[]) {
  const entries = [...day.hardStops.map((stop) => ({ progress: calculateRouteProgress(day.structural.route, stop.coordinates), stop })), ...selected.map((item) => ({ progress: item.routeProgress, stop: attractionStop(item, day.dayIndex) as DraftStop }))];
  return entries.sort((a, b) => a.progress - b.progress || (isAttractionStop(a.stop) ? a.stop.attractionId : -1) - (isAttractionStop(b.stop) ? b.stop.attractionId : -1)).map((entry) => entry.stop);
}

export async function composeDayAwareAttractions(draft: TripDraft, totalTarget: number): Promise<TripDraft> {
  const boundaryPairs = constructDayBoundaries(draft);
  const hardByDay = assignHardStopsToDays(draft);
  const contexts: DayContext[] = [];
  for (const pair of boundaryPairs) {
    const hardStops = hardByDay.get(pair.dayIndex) ?? [];
    const locations = [pair.start.coordinates, ...hardStops.map((stop) => stop.coordinates), pair.end.coordinates];
    const structural = await routingProvider.route(locations);
    const result = await findAttractionOpportunities({ locations, route: structural.route.geometry, corridorMeters: 25_000, preferences: draft.preferences }, { baselineRoute: structural, validationLimit: DAY_OPPORTUNITY_VALIDATION_LIMIT });
    const hardIds = new Set(hardStops.filter(isAttractionStop).map((stop) => stop.attractionId));
    const opportunities = result.opportunities.filter((item) => item.personalizedScore >= MIN_PERSONALIZED_SCORE && !hardIds.has(item.attraction.id)).map((item) => ({ ...item, routeProgress: calculateRouteProgress(structural.route, { lat: item.attraction.lat, lon: item.attraction.lon }), dayAdjustedScore: dayLoadAdjustedScore(item, structural.summary.durationSeconds) }));
    contexts.push({ ...pair, hardStops, structural, opportunities, diagnostics: result.diagnostics, candidateRouteCalls: result.candidateRoutesEvaluated });
  }

  const quotas = allocateDayQuotas(contexts.map((day) => ({ dayIndex: day.dayIndex, viableCount: day.opportunities.length, suitability: (day.opportunities[0]?.dayAdjustedScore ?? -Infinity) + day.structural.summary.durationSeconds / 7200 - day.hardStops.filter(isAttractionStop).length * HARD_ATTRACTION_CAPACITY_PENALTY })), totalTarget);
  const usedNames = new Set<string>();
  const selectedByDay = new Map<number, PositionedOpportunity[]>();
  for (const day of contexts) selectedByDay.set(day.dayIndex, selectForDay(day, quotas.get(day.dayIndex) ?? 0, usedNames));

  let dayCompositionCalls = 0;
  const plans: DraftDayPlan[] = [];
  const fullStops: ItineraryStop[] = [];
  for (const day of contexts) {
    let selected = selectedByDay.get(day.dayIndex) ?? [];
    let dayRoute = day.structural;
    let actualAutoDetourSeconds = 0;
    let validationCalls = 0;
    while (selected.length) {
      const stops = orderedDayStops(day, selected);
      dayRoute = await routingProvider.route([day.start.coordinates, ...stops.map((stop) => stop.coordinates), day.end.coordinates]);
      dayCompositionCalls += 1;
      validationCalls += 1;
      actualAutoDetourSeconds = Math.max(0, dayRoute.summary.durationSeconds - day.structural.summary.durationSeconds);
      if (actualAutoDetourSeconds <= dayAutoDetourBudget(day.structural.summary.durationSeconds)) break;
      const weakest = [...selected].sort((a, b) => a.dayAdjustedScore - b.dayAdjustedScore || a.attraction.id - b.attraction.id)[0];
      usedNames.delete(normalizeAttractionName(weakest.attraction.name));
      selected = removeWeakestAutomatic(selected.map((item) => ({ item, score: item.dayAdjustedScore, id: item.attraction.id }))).map(({ item }) => item);
    }
    selectedByDay.set(day.dayIndex, selected);
    const stops = orderedDayStops(day, selected);
    fullStops.push(...stops);
    if (day.end.kind === "overnight") {
      const overnight = draft.stops.find((stop) => isOvernightStop(stop) && stop.nightIndex === day.end.nightIndex);
      if (overnight) fullStops.push(overnight);
    }
    plans.push({ dayIndex: day.dayIndex, start: day.start, end: day.end, structuralDrivingSeconds: day.structural.summary.durationSeconds, structuralDistanceKm: day.structural.summary.distanceKm, autoPoiTarget: quotas.get(day.dayIndex) ?? 0, selectedAutoPoiCount: selected.length, hardAttractionCount: day.hardStops.filter(isAttractionStop).length, autoVisitMinutesKnown: selected.reduce((sum, item) => sum + knownVisitMinutes(item.attraction.visitDuration), 0), hardVisitMinutesKnown: day.hardStops.filter(isAttractionStop).reduce((sum, item) => sum + knownVisitMinutes(item.visitDuration), 0), autoDetourBudgetSeconds: dayAutoDetourBudget(day.structural.summary.durationSeconds), actualAutoDetourSeconds, selectedAttractionIds: selected.map((item) => item.attraction.id), hardAttractionIds: day.hardStops.filter(isAttractionStop).map((item) => item.attractionId), corridorCandidateCount: day.diagnostics.corridorCandidateCount, candidatesAfterDeduplication: day.diagnostics.candidatesAfterDeduplication, opportunityShortlistSize: day.diagnostics.shortlistSize, valhallaCallCount: 1 + day.candidateRouteCalls + validationCalls });
  }

  const final = await routingProvider.route([draft.origin.coordinates, ...fullStops.map((stop) => stop.coordinates), draft.destination.coordinates]);
  const selectedIds = new Set(plans.flatMap((plan) => plan.selectedAttractionIds));
  const alternatives = contexts.flatMap((day) => day.opportunities).filter((item) => !selectedIds.has(item.attraction.id)).filter((item, index, items) => items.findIndex((other) => other.attraction.id === item.attraction.id) === index).slice(0, TRIP_ALTERNATIVE_LIMIT).map((item) => alternative(item, final.route));
  const normalizedStops = fullStops.map((stop) => isAttractionStop(stop) ? { ...stop, routeProgress: calculateRouteProgress(final.route, stop.coordinates) } : stop);
  const rawDetour = final.summary.durationSeconds - draft.baselineSummary.durationSeconds;
  const selectedCount = plans.reduce((sum, plan) => sum + plan.selectedAutoPoiCount, 0);
  return { ...draft, route: final.route, summary: final.summary, stops: normalizedStops, dayPlans: plans, alternatives, composition: { ...draft.composition, selectedPoiCount: selectedCount, actualDetourSeconds: Math.max(0, rawDetour), actualDetourWasClamped: rawDetour < 0, valhallaCallCount: (draft.composition.valhallaCallCount ?? 0) + contexts.reduce((sum, day) => sum + 1 + day.candidateRouteCalls, 0) + dayCompositionCalls + 1, corridorCandidateCount: contexts.reduce((sum, day) => sum + day.diagnostics.corridorCandidateCount, 0), candidateCountConsidered: contexts.reduce((sum, day) => sum + day.diagnostics.candidateCountConsidered, 0), candidatesAfterDeduplication: contexts.reduce((sum, day) => sum + day.diagnostics.candidatesAfterDeduplication, 0), opportunityShortlistSize: contexts.reduce((sum, day) => sum + day.diagnostics.shortlistSize, 0), candidatePoolTruncated: contexts.some((day) => day.diagnostics.candidatePoolTruncated), suggestedVisitDuration: suggestedVisitDuration(normalizedStops.filter((stop): stop is DraftStop => !isOvernightStop(stop))) } };
}
