import type { VisitDuration } from "@/types/attractions";
import type { InterestCategory, TripPreferences } from "@/types/preferences";
import type { RouteFeature, RouteSummary } from "@/types/route";
import type { Coordinates } from "@/types/trip";

export type PersistedTripStatus = "draft";
export type PersistedTripVersionState = "draft" | "finalized";
export type PersistedStopType = "origin" | "destination" | "waypoint" | "attraction";
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
};

export type PersistedTripStop = {
  id: string;
  position: number;
  stopType: PersistedStopType;
  source: PersistedStopSource;
  attractionId: number | null;
  label: string;
  coordinates: Coordinates;
  nameSnapshot: string | null;
  categorySnapshot: string | null;
  metadataSnapshot: AttractionSnapshot | null;
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
  stops: PersistedTripStop[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
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
