import type { DrivingPace, TripPreferences } from "@/types/preferences";
import type { MultiDayPlan } from "@/types/trip";

export const MULTI_DAY_THRESHOLD_SECONDS = 10 * 60 * 60;
export const TARGET_DRIVING_HOURS: Record<DrivingPace, number> = {
  easy: 6,
  balanced: 8,
  road_trip: 10,
};

export function normalizePlanningPreferences(value: Partial<TripPreferences>): TripPreferences {
  return {
    preferredCategories: value.preferredCategories ?? [],
    excludedCategories: value.excludedCategories ?? [],
    detourTolerance: value.detourTolerance ?? "balanced",
    stopStyle: value.stopStyle ?? "balanced",
    drivingPace: value.drivingPace ?? "balanced",
    selectedTripDays: Number.isSafeInteger(value.selectedTripDays) && (value.selectedTripDays ?? 0) > 0 ? value.selectedTripDays! : null,
    tripDaysOverridden: value.tripDaysOverridden === true,
  };
}

export function tripDayOptions(baselineDurationSeconds: number, drivingPace: DrivingPace) {
  const hours = baselineDurationSeconds / 3600;
  const recommended = Math.max(1, Math.ceil(hours / TARGET_DRIVING_HOURS[drivingPace]));
  const minimum = Math.max(1, Math.ceil(hours / TARGET_DRIVING_HOURS.road_trip));
  return [...new Set([recommended - 1, recommended, recommended + 1].map((days) => Math.max(minimum, days)))].sort((a, b) => a - b);
}

export function calculateTripDayRecommendation(
  baselineDurationSeconds: number,
  preferences: Pick<TripPreferences, "drivingPace" | "selectedTripDays" | "tripDaysOverridden">
): MultiDayPlan {
  const recommendedDays = Math.max(1, Math.ceil(baselineDurationSeconds / 3600 / TARGET_DRIVING_HOURS[preferences.drivingPace]));
  const options = tripDayOptions(baselineDurationSeconds, preferences.drivingPace);
  const requested = preferences.tripDaysOverridden ? preferences.selectedTripDays : recommendedDays;
  const selectedDays = requested && options.includes(requested)
    ? requested
    : options.reduce((best, value) => Math.abs(value - (requested ?? recommendedDays)) < Math.abs(best - (requested ?? recommendedDays)) ? value : best, options[0]);
  const isMultiDay = baselineDurationSeconds > MULTI_DAY_THRESHOLD_SECONDS;
  return {
    isMultiDay,
    drivingPace: preferences.drivingPace,
    recommendedDays: isMultiDay ? recommendedDays : 1,
    selectedDays: isMultiDay ? selectedDays : 1,
    nights: isMultiDay ? Math.max(0, selectedDays - 1) : 0,
    baselineDrivingHours: baselineDurationSeconds / 3600,
    dayOptions: isMultiDay ? options : [1],
  };
}
