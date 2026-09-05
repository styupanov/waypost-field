export type CoverageViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type PersonalCoverageResponse = {
  coverageKind: "valhalla_inferred";
  baseResolution: 10;
  displayResolution: number;
  baseCellCount: number;
  displayCellCount: number;
  returnedCellCount: number;
  cells: string[];
};
