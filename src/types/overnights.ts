import type { Coordinates } from "@/types/trip";

export type OvernightAreaCandidate = {
  geonameId: number;
  name: string;
  admin1Code: string | null;
  countryCode: string;
  featureCode: string;
  population: number;
  coordinates: Coordinates;
  distanceToRouteSegmentMeters: number;
  distanceToNominalTargetMeters: number;
  arrivalDrivingSeconds: number;
  targetTimeDeviationMinutes: number;
  detourDurationSeconds: number;
  detourDistanceKm: number;
  score: number;
  scoreBreakdown: { timing: number; detour: number; suitability: number };
};

export type OvernightNightCandidates = {
  nightIndex: number;
  targetDrivingSeconds: number;
  windowStartSeconds: number;
  windowEndSeconds: number;
  candidates: OvernightAreaCandidate[];
  diagnostics: { settlementsInSpatialWindow: number; afterFeatureFiltering: number; databaseShortlistSize: number; valhallaValidationCount: number; finalAcceptedCandidateCount: number };
};

export type OvernightCandidateResponse = { nights: OvernightNightCandidates[]; diagnostics: { structuralRouteDurationSeconds: number; structuralRouteDistanceKm: number; valhallaCallCount: number; totalExecutionMilliseconds: number } };
