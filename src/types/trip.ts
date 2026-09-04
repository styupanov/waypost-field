import type { RouteFeature, RouteSummary } from "@/types/route";
import type {
  PersonalizedAttractionOpportunity,
  VisitDuration,
} from "@/types/attractions";
import type { TripPreferences } from "@/types/preferences";

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

export type TripField = "origin" | "stop" | "destination";
export type PickingMode = TripField | null;

export type DraftEndpoint = {
  label: string;
  coordinates: Coordinates;
};

export type TripDraft = {
  origin: DraftEndpoint;
  stop: DraftEndpoint | null;
  destination: DraftEndpoint;
  route: RouteFeature;
  summary: RouteSummary;
  baselineSummary: RouteSummary;
  stops: DraftStop[];
  composition: DraftComposition;
  preferences: TripPreferences;
};

export type DraftUserStop = DraftEndpoint & {
  source: "user";
};

export type DraftWaypostStop = {
  source: "waypost";
  attractionId: number;
  label: string;
  coordinates: Coordinates;
  category: string;
  interestCategory: PersonalizedAttractionOpportunity["attraction"]["interestCategory"];
  rating: number;
  reviewCount: number;
  duration: string | null;
  visitDuration: VisitDuration | null;
  routeProgress: number;
};

export type DraftStop = DraftUserStop | DraftWaypostStop;

export type DraftComposition = {
  targetPoiCount: number;
  selectedPoiCount: number;
  detourBudgetSeconds: number;
  actualDetourSeconds: number;
  actualDetourWasClamped: boolean;
  valhallaCallCount: number;
  corridorCandidateCount: number;
  candidateCountConsidered: number;
  candidatesAfterDeduplication: number;
  opportunityShortlistSize: number;
  candidatePoolTruncated: boolean;
  suggestedVisitDuration: {
    minimumMinutes: number;
    maximumMinutes: number | null;
    hasUnknown: boolean;
  };
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
