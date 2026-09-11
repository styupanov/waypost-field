import "server-only";
import { RoutingProviderError, type RoutingProvider } from "./routing-provider.ts";
import { calculateMatrix, calculateRoute, calculateTimedRoute, RoutingServiceError } from "./valhalla.ts";

async function normalizeValhallaError<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof RoutingServiceError) throw new RoutingProviderError(error.statusCode);
    throw error;
  }
}

export const valhallaRoutingProvider: RoutingProvider = {
  route: (locations) => normalizeValhallaError(() => calculateRoute(locations)),
  timedRoute: (locations) => normalizeValhallaError(() => calculateTimedRoute(locations)),
  matrix: (sources, targets) => normalizeValhallaError(async () =>
    (await calculateMatrix(sources, targets)).map((row, sourceIndex) =>
      row.map((cell, targetIndex) => cell ? { ...cell, sourceIndex, targetIndex } : null)
    )
  ),
};
