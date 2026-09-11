import "server-only";
import type { RoutingProvider } from "./routing-provider.ts";
import { calculateHerePlanningRoute } from "./here-planning.ts";
import { calculateHereMatrix } from "./here-matrix.ts";

export const hereRoutingProvider: RoutingProvider = {
  route: calculateHerePlanningRoute,
  matrix: calculateHereMatrix,
};
