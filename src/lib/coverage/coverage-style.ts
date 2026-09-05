export const TRIP_COVERAGE_STYLE = {
  fillOpacity: 0.2,
  outlineOpacity: 0.42,
} as const;

export const PERSONAL_MAP_COVERAGE_STYLE = {
  fillOpacity: 0,
  outlineOpacity: 0,
} as const;

export function coverageStyleForMode(personalMapMode: boolean) {
  return personalMapMode ? PERSONAL_MAP_COVERAGE_STYLE : TRIP_COVERAGE_STYLE;
}
