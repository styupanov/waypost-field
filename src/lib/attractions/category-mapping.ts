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
