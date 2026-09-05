import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  UNITS,
  cellToBoundary,
  getHexagonAreaAvg,
  getHexagonEdgeLengthAvg,
  greatCircleDistance,
  gridDistance,
  latLngToCell,
} from "h3-js";

const SAMPLE_INTERVAL_METERS = 75;
const RESOLUTIONS = [8, 9, 10] as const;
const ESTIMATED_BYTES_PER_STORED_CELL = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Coordinate = [number, number];
type RouteRow = {
  trip_id: string;
  trip_status: string;
  version_id: string;
  version_state: string;
  finalized_at: Date | null;
  geometry_type: string;
  npoints: number;
  length_km: number;
  route: { type: "LineString"; coordinates: Coordinate[] };
  here_cache_count: number;
  origin_label: string | null;
  destination_label: string | null;
};

function toVector([lon, lat]: Coordinate) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)] as const;
}

function sphericalInterpolate(start: Coordinate, end: Coordinate, fraction: number): Coordinate {
  const a = toVector(start);
  const b = toVector(end);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(dot);
  if (angle < 1e-12) return start;
  const sinAngle = Math.sin(angle);
  const startWeight = Math.sin((1 - fraction) * angle) / sinAngle;
  const endWeight = Math.sin(fraction * angle) / sinAngle;
  const x = startWeight * a[0] + endWeight * b[0];
  const y = startWeight * a[1] + endWeight * b[1];
  const z = startWeight * a[2] + endWeight * b[2];
  return [Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI];
}

function segmentMeters(start: Coordinate, end: Coordinate) {
  return greatCircleDistance([start[1], start[0]], [end[1], end[0]], UNITS.m);
}

function densify(coordinates: Coordinate[]) {
  const sampled: Coordinate[] = [coordinates[0]];
  let totalMeters = 0;
  let maximumSegmentMeters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const distance = segmentMeters(start, end);
    totalMeters += distance;
    maximumSegmentMeters = Math.max(maximumSegmentMeters, distance);
    const parts = Math.max(1, Math.ceil(distance / SAMPLE_INTERVAL_METERS));
    for (let part = 1; part <= parts; part += 1) sampled.push(sphericalInterpolate(start, end, part / parts));
  }
  return { sampled, totalMeters, maximumSegmentMeters };
}

function inspectResolution(points: Coordinate[], resolution: number) {
  const sampledCells = points.map(([lon, lat]) => latLngToCell(lat, lon, resolution));
  const cells = [...new Set(sampledCells)];
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
    sampledPointCount: points.length,
    uniqueCellCount: cells.length,
    dedupRatio: cells.length / points.length,
    duplicateSampleRate: 1 - cells.length / points.length,
    averageCellAreaKm2: getHexagonAreaAvg(resolution, UNITS.km2),
    averageEdgeLengthMeters: getHexagonEdgeLengthAvg(resolution, UNITS.m),
    evaluatedTransitions,
    suspiciousDiscontinuities,
    suspiciousDiscontinuityRate: evaluatedTransitions ? suspiciousDiscontinuities / evaluatedTransitions : 0,
    gridDistanceErrors,
    estimatedStorageBytes: cells.length * ESTIMATED_BYTES_PER_STORED_CELL,
    cells,
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
  const { sampled, totalMeters, maximumSegmentMeters } = densify(row.route.coordinates);
  const outputDirectory = path.join(process.cwd(), "tmp", "h3-calibration");
  await mkdir(outputDirectory, { recursive: true });
  const calibration = [];
  for (const resolution of RESOLUTIONS) {
    const inspected = inspectResolution(sampled, resolution);
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
    calibration.push({ ...inspected, cells: undefined, cellsPer100Km: inspected.uniqueCellCount / (row.length_km / 100), geojsonPath: outputPath });
  }
  console.log(JSON.stringify({
    source: "trip_versions.route_geom",
    coverageSourceCandidate: "valhalla_inferred",
    trip: { tripId: row.trip_id, status: row.trip_status, versionId: row.version_id, versionState: row.version_state, finalizedAt: row.finalized_at?.toISOString() ?? null, origin: row.origin_label, destination: row.destination_label, geometryType: row.geometry_type, vertexCount: row.npoints, postgisLengthKm: row.length_km, hereCacheExists: row.here_cache_count > 0 },
    routeDensity: { existingAverageVertexSpacingMeters: row.length_km * 1000 / Math.max(1, row.npoints - 1), maximumExistingSegmentMeters: maximumSegmentMeters, javascriptGeodesicLengthKm: totalMeters / 1000 },
    densification: { method: "great-circle spherical interpolation", maximumSamplingIntervalMeters: SAMPLE_INTERVAL_METERS, sampledPointCount: sampled.length },
    storageEstimateAssumption: { bytesPerCell: ESTIMATED_BYTES_PER_STORED_CELL, description: "8-byte H3 value plus approximate row/index overhead; calibration only" },
    calibration,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "H3 route calibration failed.");
  process.exitCode = 1;
} finally {
  await client.end();
}
