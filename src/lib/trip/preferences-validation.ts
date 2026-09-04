import {
  DEFAULT_TRIP_PREFERENCES,
  type InterestCategory,
  type TripPreferences,
} from "@/types/preferences";

const INTEREST_CATEGORIES: InterestCategory[] = [
  "nature_scenic",
  "outdoor_adventure",
  "history_landmarks",
  "museums_culture",
  "food_drink",
  "shopping",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseTripPreferences(
  value: unknown,
  allowDefault = true
): TripPreferences | null {
  if (value === undefined && allowDefault) {
    return {
      ...DEFAULT_TRIP_PREFERENCES,
      preferredCategories: [],
      excludedCategories: [],
    };
  }
  if (!isRecord(value)) return null;

  const {
    preferredCategories,
    excludedCategories,
    detourTolerance,
    stopStyle,
  } = value;
  if (
    !Array.isArray(preferredCategories) ||
    !Array.isArray(excludedCategories) ||
    !preferredCategories.every((category) =>
      INTEREST_CATEGORIES.includes(category as InterestCategory)
    ) ||
    !excludedCategories.every((category) =>
      INTEREST_CATEGORIES.includes(category as InterestCategory)
    ) ||
    new Set(preferredCategories).size !== preferredCategories.length ||
    new Set(excludedCategories).size !== excludedCategories.length ||
    preferredCategories.some((category) => excludedCategories.includes(category)) ||
    !["low", "balanced", "high"].includes(detourTolerance as string) ||
    !["quick", "balanced", "longer"].includes(stopStyle as string)
  ) return null;

  return {
    preferredCategories: preferredCategories as InterestCategory[],
    excludedCategories: excludedCategories as InterestCategory[],
    detourTolerance: detourTolerance as TripPreferences["detourTolerance"],
    stopStyle: stopStyle as TripPreferences["stopStyle"],
  };
}
