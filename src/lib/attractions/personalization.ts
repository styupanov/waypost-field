import { mapRawAttractionCategory } from "@/lib/attractions/category-mapping";
import { parseVisitDuration } from "@/lib/attractions/duration";
import {
  DETOUR_DISTANCE_PENALTY_PER_KM,
  DETOUR_DURATION_PENALTY_PER_HOUR,
} from "@/lib/attractions/scoring";
import type {
  AttractionOpportunity,
  PersonalizedAttractionOpportunity,
  PreferenceBreakdown,
} from "@/types/attractions";
import type { StopStyle, TripPreferences } from "@/types/preferences";

export const PREFERRED_CATEGORY_BONUS = 12;
export const QUICK_STOP_MAX_MINUTES = 120;
export const LONG_STOP_MIN_MINUTES = 180;
export const STOP_STYLE_MATCH_BONUS = 4;
export const STOP_STYLE_MISMATCH_PENALTY = -4;
export const DETOUR_PENALTY_MULTIPLIERS = {
  low: 1.75,
  balanced: 1,
  high: 0.5,
} as const;

function round(value: number, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function stopStyleAdjustment(
  style: StopStyle,
  duration: ReturnType<typeof parseVisitDuration>
) {
  if (style === "balanced" || !duration) return 0;

  const isQuick =
    duration.maximumMinutes !== null &&
    duration.maximumMinutes <= QUICK_STOP_MAX_MINUTES;
  const isLong =
    duration.minimumMinutes !== null &&
    duration.minimumMinutes >= LONG_STOP_MIN_MINUTES;

  if (style === "quick") {
    if (isQuick) return STOP_STYLE_MATCH_BONUS;
    if (isLong) return STOP_STYLE_MISMATCH_PENALTY;
  } else {
    if (isLong) return STOP_STYLE_MATCH_BONUS;
    if (isQuick) return STOP_STYLE_MISMATCH_PENALTY;
  }
  return 0;
}

export function calculatePreferenceAdjustment(
  opportunity: AttractionOpportunity,
  preferences: TripPreferences
): {
  interestCategory: ReturnType<typeof mapRawAttractionCategory>;
  visitDuration: ReturnType<typeof parseVisitDuration>;
  breakdown: PreferenceBreakdown;
  total: number;
  excluded: boolean;
} {
  const interestCategory = mapRawAttractionCategory(
    opportunity.attraction.category
  );
  const visitDuration = parseVisitDuration(opportunity.attraction.duration);
  const excluded =
    interestCategory !== null &&
    preferences.excludedCategories.includes(interestCategory);
  const category =
    interestCategory !== null &&
    preferences.preferredCategories.includes(interestCategory)
      ? PREFERRED_CATEGORY_BONUS
      : 0;

  const objectiveDetourPenalty =
    opportunity.detourDistanceKm * DETOUR_DISTANCE_PENALTY_PER_KM +
    (opportunity.detourDurationSeconds / 3600) *
      DETOUR_DURATION_PENALTY_PER_HOUR;
  const detourTolerance =
    -objectiveDetourPenalty *
    (DETOUR_PENALTY_MULTIPLIERS[preferences.detourTolerance] - 1);
  const stopStyle = stopStyleAdjustment(preferences.stopStyle, visitDuration);
  const breakdown = {
    category: round(category),
    detourTolerance: round(detourTolerance),
    stopStyle: round(stopStyle),
  };

  return {
    interestCategory,
    visitDuration,
    breakdown,
    total: round(category + detourTolerance + stopStyle),
    excluded,
  };
}

export function personalizeOpportunities(
  opportunities: AttractionOpportunity[],
  preferences: TripPreferences
): PersonalizedAttractionOpportunity[] {
  return opportunities
    .map((opportunity) => {
      const preference = calculatePreferenceAdjustment(
        opportunity,
        preferences
      );
      if (preference.excluded) return null;

      return {
        ...opportunity,
        attraction: {
          ...opportunity.attraction,
          interestCategory: preference.interestCategory,
          visitDuration: preference.visitDuration,
        },
        objectiveScore: opportunity.score,
        preferenceAdjustment: preference.total,
        preferenceBreakdown: preference.breakdown,
        personalizedScore: round(opportunity.score + preference.total),
      };
    })
    .filter(
      (value): value is PersonalizedAttractionOpportunity => value !== null
    )
    .sort(
      (left, right) =>
        right.personalizedScore - left.personalizedScore ||
        right.objectiveScore - left.objectiveScore ||
        left.attraction.id - right.attraction.id
    );
}
