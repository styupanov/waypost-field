import { INTEREST_CATEGORY_KEYS, isInterestCategory } from "../interests/taxonomy.ts";
import type { InterestCategory } from "../../types/preferences.ts";

export function parseUserInterestUpdate(value: unknown): InterestCategory[] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Array.isArray(record.selectedCategories)) return null;
  const categories = record.selectedCategories;
  if (categories.length > INTEREST_CATEGORY_KEYS.length || !categories.every(isInterestCategory)) return null;
  if (new Set(categories).size !== categories.length) return null;
  return categories;
}
