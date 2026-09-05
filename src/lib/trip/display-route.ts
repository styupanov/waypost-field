import type {
  FinalRoutePreviewState,
  TripFinalizationState,
} from "../../types/final-route.ts";
import type { RouteFeature } from "../../types/route.ts";

export function resolveDisplayedTripRoute(
  draftRoute: RouteFeature | null,
  finalizationState: TripFinalizationState,
  finalPreview: FinalRoutePreviewState
): RouteFeature | null {
  if (finalizationState.status === "planned") {
    if (finalizationState.result.tripStatus === "traveled") {
      return draftRoute
        ? {
            ...draftRoute,
            properties: {
              ...draftRoute.properties,
              routeKind: "inferred_traveled",
              source: "valhalla_inferred",
            },
          }
        : null;
    }

    if (finalizationState.result.cache.status === "valid") {
      return {
        type: "Feature",
        properties: { routeKind: "final_road_ready", provider: "here" },
        geometry: finalizationState.result.cache.finalRoute.route,
      };
    }

    return draftRoute;
  }

  if (finalPreview.status === "active") {
    return {
      type: "Feature",
      properties: { routeKind: "final_preview", provider: "here" },
      geometry: finalPreview.result.route,
    };
  }

  return draftRoute;
}
