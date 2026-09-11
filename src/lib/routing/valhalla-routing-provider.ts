import "server-only";
import type { RoutingProvider } from "./routing-provider.ts";
import { calculateMatrix, calculateRoute, calculateTimedRoute } from "./valhalla.ts";

export const valhallaRoutingProvider: RoutingProvider = {
  route: calculateRoute,
  timedRoute: calculateTimedRoute,
  matrix: async (sources, targets) => (await calculateMatrix(sources, targets)).map((row, sourceIndex) =>
    row.map((cell, targetIndex) => cell ? { ...cell, sourceIndex, targetIndex } : null)
  ),
};
