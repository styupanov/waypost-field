import "server-only";
import { routingProvider } from "@/lib/routing/provider";
import {
  calculateRouteProgress,
  suggestedVisitDuration,
  TRIP_ALTERNATIVE_LIMIT,
} from "@/lib/trip/composition";
import type {
  DraftAttractionStop,
  DraftEditAction,
  DraftStop,
  ItineraryStop,
  TripAlternative,
  TripDraft,
} from "@/types/trip";
import { isAttractionStop, isOvernightStop } from "@/types/trip";
import type { RoutePoint } from "@/types/route";

export class DraftEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftEditError";
  }
}

function stopFromAlternative(
  alternative: TripAlternative
): DraftAttractionStop {
  return {
    source: "user_attraction",
    attractionId: alternative.attractionId,
    label: alternative.name,
    coordinates: alternative.coordinates,
    category: alternative.rawCategory,
    interestCategory: alternative.interestCategory,
    rating: alternative.rating,
    reviewCount: alternative.reviewCount,
    duration: alternative.duration,
    visitDuration: alternative.visitDuration,
    routeProgress: alternative.routeProgress,
    personalizedScore: alternative.personalizedScore,
    individualDetourDistanceKm: alternative.individualDetourDistanceKm,
    individualDetourDurationSeconds: alternative.individualDetourDurationSeconds,
  };
}

function alternativeFromStop(stop: DraftAttractionStop): TripAlternative {
  return {
    attractionId: stop.attractionId,
    name: stop.label,
    coordinates: stop.coordinates,
    rawCategory: stop.category,
    interestCategory: stop.interestCategory,
    rating: stop.rating,
    reviewCount: stop.reviewCount,
    routeProgress: stop.routeProgress,
    personalizedScore: stop.personalizedScore,
    individualDetourDistanceKm: stop.individualDetourDistanceKm,
    individualDetourDurationSeconds: stop.individualDetourDurationSeconds,
    duration: stop.duration,
    visitDuration: stop.visitDuration,
  };
}

function findAlternative(draft: TripDraft, attractionId: number) {
  const alternative = draft.alternatives.find(
    (item) => item.attractionId === attractionId
  );
  if (!alternative) {
    throw new DraftEditError("The selected alternative is no longer available.");
  }
  return alternative;
}

function editStops(draft: TripDraft, action: DraftEditAction) {
  const attractionStops = draft.stops.filter(
    isAttractionStop
  );
  const selectedIds = new Set(attractionStops.map((stop) => stop.attractionId));
  let stops = [...draft.stops];
  let alternatives = [...draft.alternatives];

  if (action.type === "add") {
    if (selectedIds.has(action.attractionId)) {
      throw new DraftEditError("That attraction is already part of the trip.");
    }
    const alternative = findAlternative(draft, action.attractionId);
    stops.push(stopFromAlternative(alternative));
    alternatives = alternatives.filter(
      (item) => item.attractionId !== action.attractionId
    );
  } else {
    const removed = attractionStops.find(
      (stop) => stop.attractionId === action.attractionId
    );
    if (!removed) {
      throw new DraftEditError("The selected attraction is not part of the trip.");
    }
    stops = stops.filter(
      (stop) =>
        !isAttractionStop(stop) || stop.attractionId !== action.attractionId
    );
    alternatives = [alternativeFromStop(removed), ...alternatives];

    if (action.type === "replace") {
      if (selectedIds.has(action.replacementAttractionId)) {
        throw new DraftEditError("The replacement attraction is already part of the trip.");
      }
      const replacement = findAlternative(
        draft,
        action.replacementAttractionId
      );
      stops.push(stopFromAlternative(replacement));
      alternatives = alternatives.filter(
        (item) => item.attractionId !== action.replacementAttractionId
      );
    }
  }

  const activeIds = new Set(
    stops
      .filter(isAttractionStop)
      .map((stop) => stop.attractionId)
  );
  alternatives = alternatives
    .filter((item) => !activeIds.has(item.attractionId))
    .filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) => candidate.attractionId === item.attractionId
        ) === index
    )
    .slice(0, TRIP_ALTERNATIVE_LIMIT);
  return { stops, alternatives };
}

function orderedStops(draft: TripDraft, stops: ItineraryStop[]) {
  return [...stops].sort((left, right) => {
    const progress = (stop: ItineraryStop) =>
      isOvernightStop(stop) || stop.source === "user"
        ? calculateRouteProgress(draft.route, stop.coordinates)
        : stop.routeProgress;
    const progressDifference = progress(left) - progress(right);
    if (progressDifference !== 0) return progressDifference;
    if (!isAttractionStop(left) && isAttractionStop(right)) return -1;
    if (!isAttractionStop(right) && isAttractionStop(left)) return 1;
    const leftId = isAttractionStop(left) ? left.attractionId : -1;
    const rightId = isAttractionStop(right) ? right.attractionId : -1;
    return leftId - rightId;
  });
}

export async function editTripDraft(
  draft: TripDraft,
  action: DraftEditAction
): Promise<TripDraft> {
  const edited = editStops(draft, action);
  const stops = orderedStops(draft, edited.stops);
  const locations: RoutePoint[] = [
    draft.origin.coordinates,
    ...stops.map((stop) => stop.coordinates),
    draft.destination.coordinates,
  ];
  const nextRoute = await routingProvider.route(locations);
  const rawBaselineDetour =
    nextRoute.summary.durationSeconds - draft.baselineSummary.durationSeconds;

  return {
    ...draft,
    route: nextRoute.route,
    summary: nextRoute.summary,
    stops,
    alternatives: edited.alternatives,
    composition: {
      ...draft.composition,
      selectedPoiCount: stops.filter((stop) => isAttractionStop(stop) && stop.source === "waypost").length,
      actualDetourSeconds: Math.max(0, rawBaselineDetour),
      actualDetourWasClamped: rawBaselineDetour < 0,
      suggestedVisitDuration: suggestedVisitDuration(stops.filter((stop): stop is DraftStop => !isOvernightStop(stop))),
    },
    lastEdit: {
      action: action.type,
      previousSummary: draft.summary,
      newSummary: nextRoute.summary,
      deltaDurationSeconds:
        nextRoute.summary.durationSeconds - draft.summary.durationSeconds,
      deltaDistanceKm:
        nextRoute.summary.distanceKm - draft.summary.distanceKm,
      valhallaCallCount: 1,
    },
  };
}
