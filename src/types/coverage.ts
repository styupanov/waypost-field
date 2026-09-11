export type CoverageViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type PersonalCoverageResponse = {
  coverageKind: "route_geometry_inferred";
  baseResolution: 10;
  displayResolution: number;
  baseCellCount: number;
  displayCellCount: number;
  returnedCellCount: number;
  cells: string[];
};

export type PersonalCoverageBoundsResponse =
  | { hasCoverage: false; bounds: null }
  | { hasCoverage: true; bounds: CoverageViewport };
