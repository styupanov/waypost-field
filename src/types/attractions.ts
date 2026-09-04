export type AttractionCandidate = {
  id: number;
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  lat: number;
  lon: number;
  sourceGroup: string | null;
  duration: string | null;
  distanceToRouteMeters: number;
};

export type AttractionCandidatesResponse = {
  candidates: AttractionCandidate[];
  totalCount: number;
  truncated: boolean;
};

export type AttractionOpportunity = {
  attraction: Omit<AttractionCandidate, "distanceToRouteMeters" | "sourceGroup">;
  distanceToRouteMeters: number;
  qualityScore: number;
  detourDistanceKm: number;
  detourDurationSeconds: number;
  detourWasClamped: boolean;
  score: number;
};

export type AttractionOpportunitiesResponse = {
  opportunities: PersonalizedAttractionOpportunity[];
  candidateRoutesEvaluated: number;
  diagnostics: OpportunityDiagnostics;
};

export type OpportunityDiagnostics = {
  corridorCandidateCount: number;
  candidateCountConsidered: number;
  candidatesAfterDeduplication: number;
  duplicatesRemoved: number;
  shortlistSize: number;
  candidatePoolTruncated: boolean;
};

export type PreferenceBreakdown = {
  category: number;
  detourTolerance: number;
  stopStyle: number;
};

export type VisitDuration = {
  minimumMinutes: number | null;
  maximumMinutes: number | null;
};

export type PersonalizedAttractionOpportunity = AttractionOpportunity & {
  attraction: AttractionOpportunity["attraction"] & {
    interestCategory: import("@/types/preferences").InterestCategory | null;
    visitDuration: VisitDuration | null;
  };
  objectiveScore: number;
  preferenceAdjustment: number;
  preferenceBreakdown: PreferenceBreakdown;
  personalizedScore: number;
};
