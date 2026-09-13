import type { InterestCategory } from "@/types/preferences";

export type RawAttractionCategory =
  | "Boat Tours & Water Sports"
  | "Casinos & Gambling"
  | "Classes & Workshops"
  | "Concerts & Shows"
  | "Events"
  | "Food & Drink"
  | "Fun & Games"
  | "Museums"
  | "Nature & Parks"
  | "Nightlife"
  | "Other"
  | "Outdoor Activities"
  | "Shopping"
  | "Sights & Landmarks"
  | "Spas & Wellness"
  | "Tours"
  | "Transportation"
  | "Traveler Resources"
  | "Water & Amusement Parks"
  | "Zoos & Aquariums";

export const RAW_CATEGORY_TO_INTEREST_CATEGORY: Record<
  RawAttractionCategory,
  InterestCategory | null
> = {
  "Boat Tours & Water Sports": "outdoor_adventure",
  "Casinos & Gambling": null,
  "Classes & Workshops": null,
  "Concerts & Shows": "museums_culture",
  Events: null,
  "Food & Drink": "food_drink",
  "Fun & Games": null,
  Museums: "museums_culture",
  "Nature & Parks": "nature_scenic",
  Nightlife: null,
  Other: null,
  "Outdoor Activities": "outdoor_adventure",
  Shopping: "shopping",
  "Sights & Landmarks": "history_landmarks",
  "Spas & Wellness": null,
  Tours: null,
  Transportation: null,
  "Traveler Resources": null,
  "Water & Amusement Parks": null,
  "Zoos & Aquariums": null,
};

export function mapRawAttractionCategory(
  category: string
): InterestCategory | null {
  return (
    RAW_CATEGORY_TO_INTEREST_CATEGORY[
      category as RawAttractionCategory
    ] ?? null
  );
}

export function classifyRawAttractionCategory(category: string | null) {
  if (category === null) return "missing" as const;
  if (!Object.prototype.hasOwnProperty.call(RAW_CATEGORY_TO_INTEREST_CATEGORY, category)) {
    return "unknown" as const;
  }
  if (category === "Other") return "other" as const;
  return RAW_CATEGORY_TO_INTEREST_CATEGORY[category as RawAttractionCategory] === null
    ? "excluded" as const
    : "mapped" as const;
}
