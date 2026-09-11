import type { RoutePoint, RouteResponse } from "@/types/route";

export type RouteMatrixCell = {
  durationSeconds: number;
  distanceKm: number;
  sourceIndex: number;
  targetIndex: number;
} | null;

export interface RoutingProvider {
  route(locations: RoutePoint[]): Promise<RouteResponse>;
  matrix(sources: RoutePoint[], targets: RoutePoint[]): Promise<RouteMatrixCell[][]>;
}
