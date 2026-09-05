import { performance } from "node:perf_hooks";
import pg from "pg";
import { buildFogMask, padCoverageViewport } from "../src/lib/coverage/fog-mask.ts";
import { buildPersonalCoverageResponse } from "../src/lib/coverage/map-coverage.ts";

const tripVersionId = "fd217971-4a8c-4c9a-9a1d-29fadcba2dfb";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function geometryStats(geometry: ReturnType<typeof buildFogMask>["geometry"]) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return {
    outputPolygonCount: polygons.length,
    outputCoordinateCount: polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring) => sum + ring.length, 0), 0),
  };
}

try {
  const result = await pool.query<{ h3_index: string }>(
    "SELECT h3_index FROM public.route_coverage WHERE trip_version_id=$1 AND h3_resolution=10 ORDER BY h3_index",
    [tripVersionId]
  );
  const baseCells = result.rows.map((row) => row.h3_index);
  const scenarios = [
    { name: "route-fit", zoom: 4.5, bounds: { west: -106, south: 34, east: -79, north: 41 } },
    { name: "Nashville regional", zoom: 8.5, bounds: { west: -87.2, south: 35.4, east: -85.5, north: 36.8 } },
    { name: "Nashville neighborhood", zoom: 10, bounds: { west: -87, south: 35.8, east: -86.45, north: 36.45 } },
    { name: "Nashville close", zoom: 11.5, bounds: { west: -86.95, south: 35.95, east: -86.55, north: 36.3 } },
  ];
  const diagnostics = scenarios.map((scenario) => {
    const paddedBounds = padCoverageViewport(scenario.bounds);
    const coverage = buildPersonalCoverageResponse(baseCells, scenario.zoom, paddedBounds);
    const started = performance.now();
    const fog = buildFogMask({ bounds: paddedBounds, revealedCells: coverage.cells });
    const differenceMilliseconds = performance.now() - started;
    return {
      scenario: scenario.name,
      zoom: scenario.zoom,
      displayResolution: coverage.displayResolution,
      revealCells: coverage.returnedCellCount,
      differenceMilliseconds: Number(differenceMilliseconds.toFixed(2)),
      ...geometryStats(fog.geometry),
      geoJsonBytes: Buffer.byteLength(JSON.stringify(fog)),
    };
  });
  console.log(JSON.stringify({ baseCells: baseCells.length, diagnostics }, null, 2));
} finally {
  await pool.end();
}
