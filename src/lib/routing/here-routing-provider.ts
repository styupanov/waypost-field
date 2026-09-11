import "server-only";
import { RoutingProviderError, type RoutingProvider } from "./routing-provider.ts";
import { calculateHerePlanningRoute, calculateHereTimedRoute } from "./here-planning.ts";
import { calculateHereMatrix } from "./here-matrix.ts";
import { HereRoutingError } from "./here-client.ts";

async function normalizeHereError<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof HereRoutingError) throw new RoutingProviderError(error.statusCode);
    throw error;
  }
}

export const hereRoutingProvider: RoutingProvider = {
  route: (locations) => normalizeHereError(() => calculateHerePlanningRoute(locations)),
  timedRoute: (locations) => normalizeHereError(() => calculateHereTimedRoute(locations)),
  matrix: (sources, targets) => normalizeHereError(() => calculateHereMatrix(sources, targets)),
};
