import "server-only";
import type { RoutePoint, RouteResponse, TimedRouteResponse } from "@/types/route";
import { HereRoutingError } from "./here-client.ts";
import { hereRoutingProvider } from "./here-routing-provider.ts";
import type { RouteMatrixCell, RoutingProvider } from "./routing-provider.ts";
import { RoutingServiceError } from "./valhalla.ts";
import { valhallaRoutingProvider } from "./valhalla-routing-provider.ts";

export type RoutingProviderName = "here" | "valhalla";
export const DEFAULT_ROUTING_PROVIDER: RoutingProviderName = "valhalla";

export class RoutingProviderError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number) {
    super("The routing provider could not complete the request.");
    this.name = "RoutingProviderError";
    this.statusCode = statusCode;
  }
}

type RoutingEnvironment = Record<string, string | undefined>;

export function activeRoutingProviderName(environment: RoutingEnvironment = process.env): RoutingProviderName {
  const name = environment.ROUTING_PROVIDER ?? DEFAULT_ROUTING_PROVIDER;
  if (name !== "here" && name !== "valhalla") throw new Error(`Unsupported ROUTING_PROVIDER: ${name}`);
  return name;
}

export function getRoutingProvider(environment: RoutingEnvironment = process.env): RoutingProvider {
  return activeRoutingProviderName(environment) === "here" ? hereRoutingProvider : valhallaRoutingProvider;
}

async function invoke<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HereRoutingError || error instanceof RoutingServiceError) {
      throw new RoutingProviderError(error.statusCode);
    }
    throw error;
  }
}

// Resolve on each call so tests and local development can select a provider
// before invoking a route without coupling consumers to either implementation.
export const routingProvider: RoutingProvider = {
  route: (locations: RoutePoint[]): Promise<RouteResponse> => invoke(() => getRoutingProvider().route(locations)),
  timedRoute: (locations: RoutePoint[]): Promise<TimedRouteResponse> => invoke(() => getRoutingProvider().timedRoute(locations)),
  matrix: (sources: RoutePoint[], targets: RoutePoint[]): Promise<RouteMatrixCell[][]> => invoke(() => getRoutingProvider().matrix(sources, targets)),
};

export type RouteMatrixTimings = { outboundMatrixMs: number; inboundMatrixMs: number; matrixWallClockMs: number };

export async function calculateReturnTripMatrix(origin: RoutePoint, destinations: RoutePoint[], timings?: RouteMatrixTimings) {
  if (!destinations.length) return [];
  const wallStarted = performance.now();
  const measured = async (direction: "outboundMatrixMs" | "inboundMatrixMs", sources: RoutePoint[], targets: RoutePoint[]) => {
    const started = performance.now();
    try { return await routingProvider.matrix(sources, targets); }
    finally { if (timings) timings[direction] = performance.now() - started; }
  };
  const [outbound, inbound] = await Promise.all([
    measured("outboundMatrixMs", [origin], destinations),
    measured("inboundMatrixMs", destinations, [origin]),
  ]);
  if (timings) timings.matrixWallClockMs = performance.now() - wallStarted;
  return destinations.map((_, index) => ({ outbound: outbound[0]?.[index] ?? null, inbound: inbound[index]?.[0] ?? null }));
}
