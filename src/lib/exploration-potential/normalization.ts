export const POTENTIAL_LOWER_PERCENTILE = 0.6;
export const POTENTIAL_UPPER_PERCENTILE = 0.95;

export function percentile(sortedValues: number[], quantile: number) {
  if (sortedValues.length === 0) return 0;
  const position = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(position); const fraction = position - lower;
  return sortedValues[lower] + ((sortedValues[lower + 1] ?? sortedValues[lower]) - sortedValues[lower]) * fraction;
}

export function potentialNormalization(scores: number[]) {
  const sorted = scores.filter(Number.isFinite).sort((a, b) => a - b);
  return { lowerBound: percentile(sorted, POTENTIAL_LOWER_PERCENTILE), upperBound: percentile(sorted, POTENTIAL_UPPER_PERCENTILE) };
}

export function normalizePotential(score: number, bounds: { lowerBound: number; upperBound: number }) {
  if (!Number.isFinite(score) || score <= bounds.lowerBound || bounds.upperBound <= bounds.lowerBound) return 0;
  return Math.max(0, Math.min(1, Math.round(((score - bounds.lowerBound) / (bounds.upperBound - bounds.lowerBound)) * 1000) / 1000));
}
