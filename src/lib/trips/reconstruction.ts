import "server-only";
import {
  DRIVING_DETOUR_BUDGET_RATIO,
  MAX_DRIVING_DETOUR_SECONDS,
  MIN_PERSONALIZED_SCORE,
  TRIP_ALTERNATIVE_LIMIT,
  calculateRouteProgress,
  suggestedVisitDuration,
  targetPoiCount,
} from "@/lib/trip/composition";
import { findAttractionOpportunities } from "@/lib/attractions/opportunities";
import type { TripAlternative, TripDraft, DraftStop } from "@/types/trip";
import type { PersistedTrip, PersistedTripStop } from "@/types/trip-persistence";

function reconstructedStop(stop: PersistedTripStop): DraftStop {
  if (stop.stopType === "waypoint") {
    return { source: "user", label: stop.label, coordinates: stop.coordinates };
  }
  if (stop.stopType !== "attraction" || stop.attractionId === null) {
    throw new Error("Persisted trip contains an invalid intermediate stop.");
  }
  const snapshot = stop.metadataSnapshot;
  if (!snapshot || !stop.categorySnapshot) {
    throw new Error("Persisted attraction snapshot is incomplete.");
  }
  return {
    source: stop.source === "waypost" ? "waypost" : "user_attraction",
    attractionId: stop.attractionId,
    label: stop.nameSnapshot ?? stop.label,
    coordinates: stop.coordinates,
    category: stop.categorySnapshot,
    interestCategory: snapshot.interestCategory,
    rating: snapshot.rating,
    reviewCount: snapshot.reviewCount,
    duration: snapshot.duration,
    visitDuration: snapshot.visitDuration,
    routeProgress: snapshot.routeProgress,
    personalizedScore: snapshot.personalizedScore,
    individualDetourDistanceKm: snapshot.individualDetourDistanceKm,
    individualDetourDurationSeconds: snapshot.individualDetourDurationSeconds,
  };
}

export function reconstructTripDraft(trip: PersistedTrip): TripDraft {
  const version = trip.currentVersion;
  if (!version) throw new Error("Persisted trip has no current version.");
  const origin = version.stops.find((stop) => stop.stopType === "origin");
  const destination = version.stops.find((stop) => stop.stopType === "destination");
  const intermediateRows = version.stops.filter(
    (stop) => stop.stopType !== "origin" && stop.stopType !== "destination"
  );
  if (!origin || !destination) throw new Error("Persisted trip endpoints are incomplete.");
  const stops = intermediateRows.map(reconstructedStop);
  const userStops = stops.filter((stop) => stop.source === "user");
  if (userStops.length > 1) throw new Error("Persisted trip has unsupported user stop count.");
  const baselineSeconds = version.baselineSummary.durationSeconds;
  return {
    origin: { label: origin.label, coordinates: origin.coordinates },
    stop: userStops[0]
      ? { label: userStops[0].label, coordinates: userStops[0].coordinates }
      : null,
    destination: { label: destination.label, coordinates: destination.coordinates },
    route: version.route,
    summary: version.summary,
    baselineSummary: version.baselineSummary,
    stops,
    preferences: version.preferences,
    alternatives: [],
    lastEdit: null,
    composition: {
      targetPoiCount: targetPoiCount(baselineSeconds),
      selectedPoiCount: stops.filter((stop) => stop.source !== "user").length,
      detourBudgetSeconds: Math.min(
        baselineSeconds * DRIVING_DETOUR_BUDGET_RATIO,
        MAX_DRIVING_DETOUR_SECONDS
      ),
      actualDetourSeconds: version.drivingDetourSeconds,
      actualDetourWasClamped: null,
      valhallaCallCount: null,
      corridorCandidateCount: null,
      candidateCountConsidered: null,
      candidatesAfterDeduplication: null,
      opportunityShortlistSize: null,
      candidatePoolTruncated: null,
      suggestedVisitDuration: suggestedVisitDuration(stops),
    },
  };
}

export async function refreshTripAlternatives(draft: TripDraft) {
  const locations = [
    draft.origin.coordinates,
    ...draft.stops.map((stop) => stop.coordinates),
    draft.destination.coordinates,
  ];
  const selectedIds = new Set(
    draft.stops
      .filter((stop) => stop.source !== "user")
      .map((stop) => stop.attractionId)
  );
  const result = await findAttractionOpportunities(
    {
      locations,
      route: draft.route.geometry,
      corridorMeters: 25_000,
      preferences: draft.preferences,
    },
    { baselineRoute: { route: draft.route, summary: draft.summary } }
  );
  return result.opportunities
    .filter(
      (opportunity) =>
        opportunity.personalizedScore >= MIN_PERSONALIZED_SCORE &&
        !selectedIds.has(opportunity.attraction.id)
    )
    .slice(0, TRIP_ALTERNATIVE_LIMIT)
    .map((opportunity): TripAlternative => ({
      attractionId: opportunity.attraction.id,
      name: opportunity.attraction.name,
      coordinates: { lat: opportunity.attraction.lat, lon: opportunity.attraction.lon },
      rawCategory: opportunity.attraction.category,
      interestCategory: opportunity.attraction.interestCategory,
      rating: opportunity.attraction.rating,
      reviewCount: opportunity.attraction.reviewCount,
      routeProgress: calculateRouteProgress(draft.route, {
        lat: opportunity.attraction.lat,
        lon: opportunity.attraction.lon,
      }),
      personalizedScore: opportunity.personalizedScore,
      individualDetourDistanceKm: opportunity.detourDistanceKm,
      individualDetourDurationSeconds: opportunity.detourDurationSeconds,
      duration: opportunity.attraction.duration,
      visitDuration: opportunity.attraction.visitDuration,
    }));
}
