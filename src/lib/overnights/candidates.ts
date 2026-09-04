import "server-only";
import { getPostgresPool } from "@/lib/db/postgres";
import { calculateTimedRoute } from "@/lib/routing/valhalla";
import type { RoutePoint } from "@/types/route";
import type { TripDraft } from "@/types/trip";
import type { OvernightAreaCandidate, OvernightCandidateResponse, OvernightNightCandidates } from "@/types/overnights";
import { ELIGIBLE_SETTLEMENT_FEATURE_CODES, MAX_OVERNIGHT_DETOUR_SECONDS, OVERNIGHT_DATABASE_SHORTLIST_LIMIT, OVERNIGHT_RESULT_LIMIT, OVERNIGHT_SPATIAL_CORRIDOR_METERS, OVERNIGHT_VALHALLA_CONCURRENCY, OVERNIGHT_VALIDATION_LIMIT, overnightTargets, scoreOvernightCandidate, timedRouteWindow } from "@/lib/overnights/planning";

type SettlementRow = { geoname_id: string | number; name: string; feature_code: string; country_code: string; admin1_code: string | null; population: string | number | null; lat: number; lon: number; route_distance_m: number; target_distance_m: number; spatial_count: number; eligible_count: number };

async function mapWithConcurrency<T, R>(values: T[], mapper: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length); let next = 0;
  async function worker() { while (next < values.length) { const index = next++; results[index] = await mapper(values[index]); } }
  await Promise.all(Array.from({ length: Math.min(OVERNIGHT_VALHALLA_CONCURRENCY, values.length) }, worker));
  return results;
}

async function settlementsNearWindow(coordinates: [number, number][], target: RoutePoint) {
  const line = JSON.stringify({ type: "LineString", coordinates });
  const result = await getPostgresPool().query<SettlementRow>(
    `WITH spatial AS (
       SELECT s.*, ST_Distance(s.geom, ST_SetSRID(ST_GeomFromGeoJSON($1),4326)::geography) AS route_distance_m,
         ST_Distance(s.geom, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) AS target_distance_m
       FROM public.settlements s
       WHERE ST_DWithin(s.geom, ST_SetSRID(ST_GeomFromGeoJSON($1),4326)::geography, $4)
     ), eligible AS (
       SELECT * FROM spatial WHERE feature_code = ANY($5::text[])
     )
     SELECT geoname_id,name,feature_code,country_code,admin1_code,population,
       ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, route_distance_m,target_distance_m,
       (SELECT COUNT(1)::int FROM spatial) AS spatial_count,
       (SELECT COUNT(1)::int FROM eligible) AS eligible_count
     FROM eligible
     ORDER BY (route_distance_m / $4) * 0.45 + (target_distance_m / 120000.0) * 0.35 - LEAST(1, LN(GREATEST(COALESCE(population,0),1)) / LN(1000000.0)) * 0.20,
       geoname_id
     LIMIT $6`,
    [line, target.lon, target.lat, OVERNIGHT_SPATIAL_CORRIDOR_METERS, [...ELIGIBLE_SETTLEMENT_FEATURE_CODES], OVERNIGHT_DATABASE_SHORTLIST_LIMIT]
  );
  return result.rows;
}

function structuralLocations(draft: TripDraft) {
  return [draft.origin.coordinates, ...draft.stops.filter((stop) => stop.source === "user" || stop.source === "user_attraction").map((stop) => stop.coordinates), draft.destination.coordinates];
}

export async function findOvernightCandidates(draft: TripDraft): Promise<OvernightCandidateResponse> {
  const started = performance.now();
  if (!draft.multiDay.isMultiDay || draft.multiDay.selectedDays <= 1) return { nights: [], diagnostics: { structuralRouteDurationSeconds: 0, structuralRouteDistanceKm: 0, valhallaCallCount: 0, totalExecutionMilliseconds: performance.now() - started } };
  const locations = structuralLocations(draft);
  const structural = await calculateTimedRoute(locations);
  let valhallaCallCount = 1;
  const nights: OvernightNightCandidates[] = [];
  for (const [index, targetSeconds] of overnightTargets(structural.summary.durationSeconds, draft.multiDay.selectedDays).entries()) {
    const timedWindow = timedRouteWindow(structural, targetSeconds);
    const rows = await settlementsNearWindow(timedWindow.coordinates, timedWindow.target);
    const validationRows = rows.slice(0, OVERNIGHT_VALIDATION_LIMIT);
    const insertionIndex = structural.waypointArrivalSeconds.findIndex((seconds, waypointIndex) => waypointIndex > 0 && seconds >= targetSeconds);
    const boundedInsertionIndex = insertionIndex < 1 ? locations.length - 1 : insertionIndex;
    const evaluated = await mapWithConcurrency(validationRows, async (row) => {
      const point = { lat: row.lat, lon: row.lon };
      const candidateLocations = [...locations.slice(0, boundedInsertionIndex), point, ...locations.slice(boundedInsertionIndex)];
      const candidateIndex = boundedInsertionIndex;
      const route = await calculateTimedRoute(candidateLocations);
      const detourDurationSeconds = Math.max(0, route.summary.durationSeconds - structural.summary.durationSeconds);
      const targetTimeDeviationMinutes = Math.abs(route.waypointArrivalSeconds[candidateIndex] - targetSeconds) / 60;
      const scored = scoreOvernightCandidate({ targetTimeDeviationMinutes, detourDurationSeconds, population: Number(row.population ?? 0), featureCode: row.feature_code });
      return { geonameId: Number(row.geoname_id), name: row.name, admin1Code: row.admin1_code, countryCode: row.country_code, featureCode: row.feature_code, population: Number(row.population ?? 0), coordinates: point, distanceToRouteSegmentMeters: row.route_distance_m, distanceToNominalTargetMeters: row.target_distance_m, arrivalDrivingSeconds: route.waypointArrivalSeconds[candidateIndex], targetTimeDeviationMinutes, detourDurationSeconds, detourDistanceKm: Math.max(0, route.summary.distanceKm - structural.summary.distanceKm), score: scored.score, scoreBreakdown: scored.breakdown } satisfies OvernightAreaCandidate;
    });
    valhallaCallCount += validationRows.length;
    const candidates = evaluated.filter((candidate) => candidate.detourDurationSeconds <= MAX_OVERNIGHT_DETOUR_SECONDS).sort((a,b) => b.score-a.score || a.geonameId-b.geonameId).slice(0, OVERNIGHT_RESULT_LIMIT);
    nights.push({ nightIndex: index + 1, targetDrivingSeconds: targetSeconds, windowStartSeconds: timedWindow.window.start, windowEndSeconds: timedWindow.window.end, candidates, diagnostics: { settlementsInSpatialWindow: rows[0]?.spatial_count ?? 0, afterFeatureFiltering: rows[0]?.eligible_count ?? 0, databaseShortlistSize: rows.length, valhallaValidationCount: validationRows.length, finalAcceptedCandidateCount: candidates.length } });
  }
  return { nights, diagnostics: { structuralRouteDurationSeconds: structural.summary.durationSeconds, structuralRouteDistanceKm: structural.summary.distanceKm, valhallaCallCount, totalExecutionMilliseconds: performance.now() - started } };
}
