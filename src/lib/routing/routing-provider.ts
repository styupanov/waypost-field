import type { RoutePoint, RouteResponse, TimedRouteResponse } from "@/types/route";

export type RouteMatrixCell = {
  durationSeconds: number;
  distanceKm: number;
  sourceIndex: number;
  targetIndex: number;
} | null;

export class RoutingProviderError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number) {
    super("The routing provider could not complete the request.");
    this.name = "RoutingProviderError";
    this.statusCode = statusCode;
  }
}

export interface RoutingProvider {
  route(locations: RoutePoint[]): Promise<RouteResponse>;
  timedRoute(locations: RoutePoint[]): Promise<TimedRouteResponse>;
  matrix(sources: RoutePoint[], targets: RoutePoint[]): Promise<RouteMatrixCell[][]>;
}
