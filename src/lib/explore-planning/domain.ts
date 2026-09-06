import type { DrivingPace } from "../../types/preferences.ts";

export const EXPLORE_STATIC_SHORTLIST_SIZE = 25;
export const EXPLORE_RESULT_LIMIT = 3;
export const EXPLORE_ROUTING_CONCURRENCY = 4;
export const EXPLORE_FALLBACK_ROUTING_CONCURRENCY = 8;
export const EXPLORE_EXACT_ROUTE_LIMIT = 5;

export const DRIVING_HOURS_BY_PACE: Record<DrivingPace, number> = {
  easy: 6,
  balanced: 8,
  road_trip: 10,
};

export function exploreDrivingBudgetSeconds(days: number, pace: DrivingPace) {
  return days * DRIVING_HOURS_BY_PACE[pace] * 3600;
}

export function exploreRouteFitsBudget(durationSeconds: number, budgetSeconds: number) {
  return durationSeconds <= budgetSeconds;
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
