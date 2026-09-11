import type { InterestCategory } from "./preferences";
import type { VisitDuration } from "./attractions";

export type ExplorePlanningRequest = {
  area: { h3Index: string; resolution: number };
  origin: { latitude: number; longitude: number; label: string };
  availableDays: 1 | 2 | 3;
  drivingPace: "easy" | "balanced" | "road_trip";
  interests: InterestCategory[];
};

export type ExploreTripIdea = {
  id: string;
  destination: {
    attractionId: number;
    name: string;
    latitude: number;
    longitude: number;
    categoryLabel: string;
    rawCategory: string;
    interestCategory: InterestCategory | null;
    rating: number;
    reviewCount: number;
    duration: string | null;
    visitDuration: VisitDuration | null;
    qualityScore: number;
  };
  route: { distanceMeters: number; durationSeconds: number; provider: "here" | "valhalla" };
};

export type ExploreIdeasResponse = {
  ideas: ExploreTripIdea[];
  outcome: "ideas" | "no_matching_attractions" | "outside_driving_budget" | "routing_failed";
};
