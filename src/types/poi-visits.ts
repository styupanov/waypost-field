export type PoiVisitOutcome = "visited" | "not_visited";

export type PoiVisitItem = {
  tripStopId: string;
  name: string;
  source: "user" | "waypost";
  attractionId: number | null;
  outcome: PoiVisitOutcome | null;
  confirmedAt: string | null;
};

export type PoiVisitsResponse = {
  tripId: string;
  versionId: string;
  items: PoiVisitItem[];
};
