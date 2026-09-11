import type { RoutePoint, RouteResponse, TimedRouteResponse } from "@/types/route";

export type RouteMatrixCell = {
  durationSeconds: number;
  distanceKm: number;
  sourceIndex: number;
  targetIndex: number;
} | null;

export interface RoutingProvider {
  route(locations: RoutePoint[]): Promise<RouteResponse>;
  timedRoute(locations: RoutePoint[]): Promise<TimedRouteResponse>;
  matrix(sources: RoutePoint[], targets: RoutePoint[]): Promise<RouteMatrixCell[][]>;
}
