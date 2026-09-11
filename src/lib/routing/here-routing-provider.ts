import "server-only";
import type { RoutingProvider } from "./routing-provider.ts";
import { calculateHerePlanningRoute, calculateHereTimedRoute } from "./here-planning.ts";
import { calculateHereMatrix } from "./here-matrix.ts";

export const hereRoutingProvider: RoutingProvider = {
  route: calculateHerePlanningRoute,
  timedRoute: calculateHereTimedRoute,
  matrix: calculateHereMatrix,
};
