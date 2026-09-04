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
  opportunities: AttractionOpportunity[];
};
