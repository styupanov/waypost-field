import "server-only";
import { mapRawAttractionCategory } from "../attractions/category-mapping.ts";
import { rawExplorationPotential } from "../exploration-intelligence/model.ts";
import { loadUserInterestProfile } from "../user-interests/repository.ts";
import { loadPotentialInputCells } from "./repository.ts";
import { normalizePotential, potentialNormalization } from "./normalization.ts";
import type { CoverageViewport } from "../../types/coverage.ts";
import type { ExplorationPotentialResponse } from "../../types/exploration-potential.ts";

const normalizationCache = new Map<string, { lowerBound: number; upperBound: number }>();

function sourceCategoriesFor(interests: string[]) {
  if (interests.length === 0) return null;
  const selected = new Set(interests);
  const knownSourceCategories = ["Boat Tours & Water Sports", "Concerts & Shows", "Food & Drink", "Museums", "Nature & Parks", "Outdoor Activities", "Shopping", "Sights & Landmarks"];
  return knownSourceCategories.filter((category) => { const mapped = mapRawAttractionCategory(category); return mapped && selected.has(mapped); });
}

function scoreCell(cell: Awaited<ReturnType<typeof loadPotentialInputCells>>[number]) {
  return rawExplorationPotential(cell.counts.reduce((sum, item) => sum + item.count, 0), cell.counts.length);
}

export async function getExplorationPotential(userId: string, resolution: number, viewport: CoverageViewport): Promise<ExplorationPotentialResponse> {
  const profile = await loadUserInterestProfile(userId);
  const interests = profile.interests.map(({ category }) => category).sort();
  const sourceCategories = sourceCategoriesFor(interests);
  const mode = interests.length ? "personalized" : "generic";
  const cacheKey = `${resolution}:${interests.join(",") || "generic"}`;
  let bounds = normalizationCache.get(cacheKey);
  if (!bounds) {
    const population = await loadPotentialInputCells(resolution, sourceCategories);
    bounds = potentialNormalization(population.map(scoreCell)); normalizationCache.set(cacheKey, bounds);
  }
  const viewportCells = await loadPotentialInputCells(resolution, sourceCategories, viewport);
  return { mode, resolution, cells: viewportCells.map((cell) => ({ h3Index: cell.h3Index, intensity: normalizePotential(scoreCell(cell), bounds!) })).filter((cell) => cell.intensity > 0) };
}

export function clearPotentialNormalizationCache() { normalizationCache.clear(); }
