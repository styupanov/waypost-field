export type ExploreIntent = {
  kind: "explore_area";
  h3Index: string;
  resolution: number;
  anchor: { latitude: number; longitude: number };
};
