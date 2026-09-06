import type { InterestCategory } from "./preferences.ts";

export type AreaCategoryBreakdown = { category: InterestCategory; label: string; count: number };

type AreaExplorationBase = {
  area: { h3Index: string; resolution: number };
  totalPlaceCount: number;
  canonicalSupportedPlaceCount: number;
  unmappedPlaceCount: number;
  categoryBreakdown: AreaCategoryBreakdown[];
  potential: { rawScore: number };
};

export type AreaExplorationIntelligence = AreaExplorationBase & (
  | { mode: "generic" }
  | { mode: "personalized"; matchedPlaceCount: number; matchedCategoryCount: number }
);

export type AreaExplorationAggregate = { sourceCategory: string; count: number };
export type AreaIntelligenceClientState =
  | { status: "idle" | "loading" | "error"; data: null }
  | { status: "ready"; data: AreaExplorationIntelligence };
