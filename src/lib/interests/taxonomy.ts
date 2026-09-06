import type { InterestCategory } from "../../types/preferences.ts";

export const INTEREST_CATEGORIES = [
  { key: "nature_scenic", label: "Nature & Scenic" },
  { key: "outdoor_adventure", label: "Outdoor & Adventure" },
  { key: "history_landmarks", label: "History & Landmarks" },
  { key: "museums_culture", label: "Museums & Culture" },
  { key: "food_drink", label: "Food & Drink" },
  { key: "shopping", label: "Shopping" },
] as const satisfies readonly { key: InterestCategory; label: string }[];

export const INTEREST_CATEGORY_KEYS = INTEREST_CATEGORIES.map(({ key }) => key) as InterestCategory[];

export function isInterestCategory(value: unknown): value is InterestCategory {
  return typeof value === "string" && INTEREST_CATEGORY_KEYS.includes(value as InterestCategory);
}
