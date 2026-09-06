import { INTEREST_CATEGORIES } from "../interests/taxonomy.ts";
import { mapRawAttractionCategory } from "../attractions/category-mapping.ts";
import type { UserInterestProfile } from "../../types/user-interests.ts";
import type { AreaCategoryBreakdown, AreaExplorationAggregate, AreaExplorationIntelligence } from "../../types/exploration-intelligence.ts";

const taxonomyOrder = new Map(INTEREST_CATEGORIES.map(({ key }, index) => [key, index]));
const labels = new Map(INTEREST_CATEGORIES.map(({ key, label }) => [key, label]));

export function rawExplorationPotential(relevantPlaceCount: number, representedCategoryCount: number) {
  if (!Number.isFinite(relevantPlaceCount) || !Number.isFinite(representedCategoryCount) || relevantPlaceCount <= 0) return 0;
  const diversityBonus = 1 + Math.min(Math.max(0, representedCategoryCount - 1), 5) * 0.08;
  return Math.round(Math.log1p(relevantPlaceCount) * diversityBonus * 1000) / 1000;
}

function canonicalBreakdown(rows: AreaExplorationAggregate[], selected: Set<string> | null): AreaCategoryBreakdown[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const category = mapRawAttractionCategory(row.sourceCategory);
    if (!category || (selected && !selected.has(category))) continue;
    counts.set(category, (counts.get(category) ?? 0) + row.count);
  }
  return [...counts.entries()].map(([category, count]) => ({
    category: category as AreaCategoryBreakdown["category"], label: labels.get(category as AreaCategoryBreakdown["category"]) ?? category, count,
  })).sort((a, b) => b.count - a.count || (taxonomyOrder.get(a.category) ?? 0) - (taxonomyOrder.get(b.category) ?? 0));
}

export function buildAreaExplorationIntelligence(
  area: { h3Index: string; resolution: number },
  rows: AreaExplorationAggregate[],
  profile: UserInterestProfile
): AreaExplorationIntelligence {
  const totalPlaceCount = rows.reduce((sum, row) => sum + row.count, 0);
  const allCanonical = canonicalBreakdown(rows, null);
  const canonicalSupportedPlaceCount = allCanonical.reduce((sum, item) => sum + item.count, 0);
  const base = { area, totalPlaceCount, canonicalSupportedPlaceCount, unmappedPlaceCount: totalPlaceCount - canonicalSupportedPlaceCount };
  if (profile.interests.length === 0) {
    return { ...base, mode: "generic", categoryBreakdown: allCanonical, potential: { rawScore: rawExplorationPotential(totalPlaceCount, rows.filter((row) => row.count > 0).length) } };
  }
  const selected = new Set(profile.interests.map(({ category }) => category));
  const categoryBreakdown = canonicalBreakdown(rows, selected);
  const matchedPlaceCount = categoryBreakdown.reduce((sum, item) => sum + item.count, 0);
  return { ...base, mode: "personalized", matchedPlaceCount, matchedCategoryCount: categoryBreakdown.length, categoryBreakdown, potential: { rawScore: rawExplorationPotential(matchedPlaceCount, categoryBreakdown.length) } };
}
