import type { RouteFeature, RouteSummary } from "@/types/route";
import type {
  PersonalizedAttractionOpportunity,
  VisitDuration,
} from "@/types/attractions";
import type { TripPreferences } from "@/types/preferences";
import type { OvernightNightCandidates } from "@/types/overnights";

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
  stops: ItineraryStop[];
  composition: DraftComposition;
  preferences: TripPreferences;
  alternatives: TripAlternative[];
  lastEdit: DraftEditImpact | null;
  multiDay: MultiDayPlan;
  overnightAlternatives: OvernightNightCandidates[];
  dayPlans: DraftDayPlan[];
};

export type DraftDayBoundary = {
  kind: "origin" | "overnight" | "destination";
  label: string;
  coordinates: Coordinates;
  nightIndex: number | null;
};

export type DraftDayPlan = {
  dayIndex: number;
  start: DraftDayBoundary;
  end: DraftDayBoundary;
  structuralDrivingSeconds: number;
  structuralDistanceKm: number;
  autoPoiTarget: number;
  selectedAutoPoiCount: number;
  hardAttractionCount: number;
  autoVisitMinutesKnown: number;
  hardVisitMinutesKnown: number;
  autoDetourBudgetSeconds: number;
  actualAutoDetourSeconds: number;
  selectedAttractionIds: number[];
  hardAttractionIds: number[];
  corridorCandidateCount: number;
  candidatesAfterDeduplication: number;
  opportunityShortlistSize: number;
  valhallaCallCount: number;
};

export type MultiDayPlan = {
  isMultiDay: boolean;
  drivingPace: import("@/types/preferences").DrivingPace;
  recommendedDays: number;
  selectedDays: number;
  nights: number;
  baselineDrivingHours: number;
  dayOptions: number[];
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
  personalizedScore: number;
  individualDetourDistanceKm: number;
  individualDetourDurationSeconds: number;
  dayIndex?: number | null;
};

export type DraftUserAttractionStop = Omit<DraftWaypostStop, "source"> & {
  source: "user_attraction";
  intentRole?: "primary_anchor";
};

export type DraftAttractionStop =
  | DraftWaypostStop
  | DraftUserAttractionStop;

export type DraftStop = DraftUserStop | DraftAttractionStop;

export type DraftOvernightStop = {
  type: "overnight";
  source: "waypost" | "user";
  nightIndex: number;
  geonameId: number;
  label: string;
  admin1Code: string | null;
  countryCode: string;
  featureCode: string;
  population: number;
  coordinates: Coordinates;
  targetDrivingSeconds: number;
  arrivalDrivingSeconds: number;
  targetTimeDeviationMinutes: number;
  detourDurationSeconds: number;
  detourDistanceKm: number;
  score: number;
};

export type ItineraryStop = DraftStop | DraftOvernightStop;
export function isOvernightStop(stop: ItineraryStop): stop is DraftOvernightStop { return "type" in stop && stop.type === "overnight"; }
export function isAttractionStop(stop: ItineraryStop): stop is DraftAttractionStop { return !isOvernightStop(stop) && stop.source !== "user"; }

export type TripAlternative = {
  attractionId: number;
  name: string;
  coordinates: Coordinates;
  rawCategory: string;
  interestCategory: PersonalizedAttractionOpportunity["attraction"]["interestCategory"];
  rating: number;
  reviewCount: number;
  routeProgress: number;
  personalizedScore: number;
  individualDetourDistanceKm: number;
  individualDetourDurationSeconds: number;
  duration: string | null;
  visitDuration: VisitDuration | null;
};

export type DraftEditAction =
  | { type: "add"; attractionId: number }
  | { type: "remove"; attractionId: number }
  | {
      type: "replace";
      attractionId: number;
      replacementAttractionId: number;
    };

export type DraftEditImpact = {
  action: DraftEditAction["type"];
  previousSummary: RouteSummary;
  newSummary: RouteSummary;
  deltaDurationSeconds: number;
  deltaDistanceKm: number;
  valhallaCallCount: number;
};

export type DraftComposition = {
  targetPoiCount: number;
  selectedPoiCount: number;
  detourBudgetSeconds: number;
  actualDetourSeconds: number;
  actualDetourWasClamped: boolean | null;
  valhallaCallCount: number | null;
  corridorCandidateCount: number | null;
  candidateCountConsidered: number | null;
  candidatesAfterDeduplication: number | null;
  opportunityShortlistSize: number | null;
  candidatePoolTruncated: boolean | null;
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
