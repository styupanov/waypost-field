export type ExplorationPotentialCell = { h3Index: string; intensity: number };
export type ExplorationPotentialResponse = {
  mode: "generic" | "personalized";
  resolution: number;
  cells: ExplorationPotentialCell[];
};
