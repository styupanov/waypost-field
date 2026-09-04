export type InterestCategory =
  | "nature_scenic"
  | "outdoor_adventure"
  | "history_landmarks"
  | "museums_culture"
  | "food_drink"
  | "shopping";

export type DetourTolerance = "low" | "balanced" | "high";
export type StopStyle = "quick" | "balanced" | "longer";
export type DrivingPace = "easy" | "balanced" | "road_trip";

export type TripPreferences = {
  preferredCategories: InterestCategory[];
  excludedCategories: InterestCategory[];
  detourTolerance: DetourTolerance;
  stopStyle: StopStyle;
  drivingPace: DrivingPace;
  selectedTripDays: number | null;
  tripDaysOverridden: boolean;
};

export const DEFAULT_TRIP_PREFERENCES: TripPreferences = {
  preferredCategories: [],
  excludedCategories: [],
  detourTolerance: "balanced",
  stopStyle: "balanced",
  drivingPace: "balanced",
  selectedTripDays: null,
  tripDaysOverridden: false,
};
