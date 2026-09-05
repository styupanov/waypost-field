import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  UNITS,
  cellToBoundary,
  getHexagonAreaAvg,
  getHexagonEdgeLengthAvg,
  gridDistance,
} from "h3-js";
import { MAX_SAMPLE_INTERVAL_METERS, generateH3RouteCells, type RouteCoordinate } from "../src/lib/coverage/h3-route.ts";

const RESOLUTIONS = [8, 9, 10] as const;
const ESTIMATED_BYTES_PER_STORED_CELL = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteRow = {
  trip_id: string;
  trip_status: string;
  version_id: string;
  version_state: string;
  finalized_at: Date | null;
  geometry_type: string;
  npoints: number;
  length_km: number;
  route: { type: "LineString"; coordinates: RouteCoordinate[] };
  here_cache_count: number;
  origin_label: string | null;
  destination_label: string | null;
};

function inspectResolution(route: RouteRow["route"], resolution: number) {
  const generated = generateH3RouteCells(route, resolution);
  const { sampledCells, cells } = generated;
  let suspiciousDiscontinuities = 0;
  let gridDistanceErrors = 0;
  let evaluatedTransitions = 0;
  for (let index = 1; index < sampledCells.length; index += 1) {
    if (sampledCells[index] === sampledCells[index - 1]) continue;
    evaluatedTransitions += 1;
    try {
      if (gridDistance(sampledCells[index - 1], sampledCells[index]) > 1) suspiciousDiscontinuities += 1;
    } catch {
      gridDistanceErrors += 1;
    }
  }
  return {
    resolution,
    sampledPointCount: generated.sampled.length,
    uniqueCellCount: cells.length,
    dedupRatio: cells.length / generated.sampled.length,
    duplicateSampleRate: 1 - cells.length / generated.sampled.length,
    averageCellAreaKm2: getHexagonAreaAvg(resolution, UNITS.km2),
    averageEdgeLengthMeters: getHexagonEdgeLengthAvg(resolution, UNITS.m),
    evaluatedTransitions,
    suspiciousDiscontinuities,
    suspiciousDiscontinuityRate: evaluatedTransitions ? suspiciousDiscontinuities / evaluatedTransitions : 0,
    gridDistanceErrors,
    estimatedStorageBytes: cells.length * ESTIMATED_BYTES_PER_STORED_CELL,
    cells,
    totalMeters: generated.totalMeters,
    maximumSegmentMeters: generated.maximumSegmentMeters,
  };
}

const versionId = process.argv[2];
if (!versionId || !UUID_PATTERN.test(versionId)) {
  console.error("Usage: npm run calibrate:h3-route -- <finalized-trip-version-id>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query<RouteRow>(
    `SELECT t.id AS trip_id,t.status AS trip_status,v.id AS version_id,v.state AS version_state,v.finalized_at,
       ST_GeometryType(v.route_geom) AS geometry_type,ST_NPoints(v.route_geom)::int AS npoints,
       ST_Length(v.route_geom::geography)/1000 AS length_km,ST_AsGeoJSON(v.route_geom)::json AS route,
       (SELECT count(*)::int FROM provider_route_cache c WHERE c.trip_version_id=v.id) AS here_cache_count,
       MAX(s.label) FILTER (WHERE s.stop_type='origin') AS origin_label,
       MAX(s.label) FILTER (WHERE s.stop_type='destination') AS destination_label
     FROM trip_versions v JOIN trips t ON t.current_version_id=v.id
     LEFT JOIN trip_stops s ON s.trip_version_id=v.id
     WHERE v.id=$1 GROUP BY t.id,v.id`,
    [versionId]
  );
  const row = result.rows[0];
  if (!row) throw new Error("The specified current TripVersion was not found.");
  if (row.version_state !== "finalized") throw new Error("The specified TripVersion is not finalized.");
  if (row.geometry_type !== "ST_LineString" || row.route.type !== "LineString") throw new Error("TripVersion route geometry is not a LineString.");
  const outputDirectory = path.join(process.cwd(), "tmp", "h3-calibration");
  await mkdir(outputDirectory, { recursive: true });
  const calibration = [];
  for (const resolution of RESOLUTIONS) {
    const inspected = inspectResolution(row.route, resolution);
    const filename = `${row.destination_label?.toLowerCase().includes("denver") ? "denver" : row.version_id}-res${resolution}.geojson`;
    const outputPath = path.join(outputDirectory, filename);
    const geojson = {
      type: "FeatureCollection",
      features: inspected.cells.map((cell) => {
        const boundary = cellToBoundary(cell, true);
        return {
          type: "Feature",
          properties: { h3: cell, resolution },
          geometry: { type: "Polygon", coordinates: [[...boundary, boundary[0]]] },
        };
      }),
    };
    await writeFile(outputPath, JSON.stringify(geojson));
    calibration.push({ ...inspected, cells: undefined, totalMeters: undefined, maximumSegmentMeters: undefined, cellsPer100Km: inspected.uniqueCellCount / (row.length_km / 100), geojsonPath: outputPath });
  }
  const density = generateH3RouteCells(row.route, 10);
  console.log(JSON.stringify({
    source: "trip_versions.route_geom",
    coverageSourceCandidate: "valhalla_inferred",
    trip: { tripId: row.trip_id, status: row.trip_status, versionId: row.version_id, versionState: row.version_state, finalizedAt: row.finalized_at?.toISOString() ?? null, origin: row.origin_label, destination: row.destination_label, geometryType: row.geometry_type, vertexCount: row.npoints, postgisLengthKm: row.length_km, hereCacheExists: row.here_cache_count > 0 },
    routeDensity: { existingAverageVertexSpacingMeters: row.length_km * 1000 / Math.max(1, row.npoints - 1), maximumExistingSegmentMeters: density.maximumSegmentMeters, javascriptGeodesicLengthKm: density.totalMeters / 1000 },
    densification: { method: "great-circle spherical interpolation", maximumSamplingIntervalMeters: MAX_SAMPLE_INTERVAL_METERS, sampledPointCount: density.sampled.length },
    storageEstimateAssumption: { bytesPerCell: ESTIMATED_BYTES_PER_STORED_CELL, description: "8-byte H3 value plus approximate row/index overhead; calibration only" },
    calibration,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "H3 route calibration failed.");
  process.exitCode = 1;
} finally {
  await client.end();
}
