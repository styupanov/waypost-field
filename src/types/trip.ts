import type { RouteFeature, RouteSummary } from "@/types/route";

export type Coordinates = {
  lat: number;
  lon: number;
};

export type TripEndpointSource = "text" | "map";

export type TripEndpoint = {
  input: string;
  coordinates: Coordinates | null;
  resolvedLabel: string | null;
  source: TripEndpointSource;
};

export type TripField = "origin" | "destination";
export type PickingMode = TripField | null;

export type DraftEndpoint = {
  label: string;
  coordinates: Coordinates;
};

export type TripDraft = {
  origin: DraftEndpoint;
  destination: DraftEndpoint;
  route: RouteFeature;
  summary: RouteSummary;
};

export type PlannerState =
  | {
      status: "trip_intent";
    }
  | {
      status: "generating_draft";
      previousDraft: TripDraft | null;
      previousIsDirty: boolean;
    }
  | {
      status: "draft_ready";
      draft: TripDraft;
      isDirty: boolean;
    };
