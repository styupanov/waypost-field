import "server-only";
import { loadUserInterestProfile } from "../user-interests/repository.ts";
import { loadAreaExplorationAggregates } from "./repository.ts";
import { buildAreaExplorationIntelligence } from "./model.ts";

export async function getAreaExplorationIntelligence(input: { userId: string; h3Index: string; resolution: number }) {
  const [rows, profile] = await Promise.all([loadAreaExplorationAggregates(input.h3Index, input.resolution), loadUserInterestProfile(input.userId)]);
  return buildAreaExplorationIntelligence({ h3Index: input.h3Index, resolution: input.resolution }, rows, profile);
}
