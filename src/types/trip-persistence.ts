import type { VisitDuration } from "@/types/attractions";
import type { InterestCategory, TripPreferences } from "@/types/preferences";
import type { RouteFeature, RouteSummary } from "@/types/route";
import type { Coordinates, DraftDayPlan } from "@/types/trip";

export type PersistedTripStatus = "draft" | "planned";
export type PersistedTripVersionState = "draft" | "finalized";
export type PersistedStopType = "origin" | "destination" | "waypoint" | "attraction" | "overnight";
export type PersistedStopSource = "user" | "waypost";

export type AttractionSnapshot = {
  interestCategory: InterestCategory | null;
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

export type PersistedTripStop = {
  id: string;
  position: number;
  stopType: PersistedStopType;
  source: PersistedStopSource;
  attractionId: number | null;
  settlementGeonameId: number | null;
  nightIndex: number | null;
  label: string;
  coordinates: Coordinates;
  nameSnapshot: string | null;
  categorySnapshot: string | null;
  metadataSnapshot: AttractionSnapshot | null;
  admin1Snapshot: string | null;
  featureCodeSnapshot: string | null;
  populationSnapshot: number | null;
  overnightMetadata: import("@/types/trip").DraftOvernightStop | null;
};

export type PersistedTripVersion = {
  id: string;
  versionNo: number;
  state: PersistedTripVersionState;
  preferences: TripPreferences;
  route: RouteFeature;
  summary: RouteSummary;
  baselineSummary: RouteSummary;
  drivingDetourSeconds: number;
  routingEngine: string;
  routingEngineVersion: string | null;
  plannerVersion: string;
  dayPlans: DraftDayPlan[];
  stops: PersistedTripStop[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  finalizationProvider: "here" | null;
};

export type PersistedTrip = {
  id: string;
  userId: string;
  title: string | null;
  status: PersistedTripStatus;
  currentVersionId: string | null;
  currentVersion: PersistedTripVersion | null;
  createdAt: string;
  updatedAt: string;
};

export type TripListItem = {
  id: string;
  status: PersistedTripStatus;
  currentVersionId: string | null;
  versionState: PersistedTripVersionState | null;
  originLabel: string | null;
  destinationLabel: string | null;
  attractionStopCount: number;
  preferences: TripPreferences | null;
  createdAt: string;
  updatedAt: string;
};
