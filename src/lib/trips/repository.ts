import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "../db/postgres.ts";
import {
  WAYPOST_PLANNER_VERSION,
  WAYPOST_ROUTING_ENGINE,
} from "../trip/planner-version.ts";
import type { TripDraft, DraftStop } from "@/types/trip";
import type {
  AttractionSnapshot,
  PersistedStopSource,
  PersistedStopType,
  PersistedTrip,
  PersistedTripStop,
  PersistedTripVersion,
  PersistedTripVersionState,
  TripListItem,
} from "@/types/trip-persistence";
import type { RouteSummary } from "@/types/route";

export class TripPersistenceError extends Error {
  readonly code:
    | "INVALID_TRIP_DRAFT"
    | "INVALID_IDENTIFIER"
    | "USER_NOT_FOUND"
    | "TRIP_NOT_FOUND"
    | "CURRENT_VERSION_NOT_FOUND"
    | "FINALIZED_VERSION_IMMUTABLE";

  constructor(
    code:
      | "INVALID_TRIP_DRAFT"
      | "INVALID_IDENTIFIER"
      | "USER_NOT_FOUND"
      | "TRIP_NOT_FOUND"
      | "CURRENT_VERSION_NOT_FOUND"
      | "FINALIZED_VERSION_IMMUTABLE",
    message: string
  ) {
    super(message);
    this.name = "TripPersistenceError";
    this.code = code;
  }
}

type TripRow = {
  id: string;
  user_id: string;
  title: string | null;
  status: "draft";
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type VersionRow = {
  id: string;
  version_no: number;
  state: PersistedTripVersionState;
  preferences: PersistedTripVersion["preferences"];
  route_geometry: { type: "LineString"; coordinates: [number, number][] };
  distance_m: number;
  duration_seconds: number;
  has_toll: boolean;
  has_highway: boolean;
  has_ferry: boolean;
  baseline_distance_m: number;
  baseline_duration_seconds: number;
  baseline_has_toll: boolean;
  baseline_has_highway: boolean;
  baseline_has_ferry: boolean;
  driving_detour_seconds: number;
  routing_engine: string;
  routing_engine_version: string | null;
  planner_version: string;
  created_at: Date;
  updated_at: Date;
  finalized_at: Date | null;
};

type StopRow = {
  id: string;
  position: number;
  stop_type: PersistedStopType;
  source: PersistedStopSource;
  attraction_id: string | number | null;
  label: string;
  lon: number;
  lat: number;
  name_snapshot: string | null;
  category_snapshot: string | null;
  metadata_snapshot: AttractionSnapshot | null;
};

function validCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TripPersistenceError("INVALID_IDENTIFIER", "Trip persistence identifier is invalid.");
  }
}

function validateDraft(draft: TripDraft) {
  const routeCoordinates = draft.route.geometry.coordinates;
  if (
    draft.route.geometry.type !== "LineString" ||
    routeCoordinates.length < 2 ||
    routeCoordinates.some(([lon, lat]) => !validCoordinate(lat, lon)) ||
    !validCoordinate(draft.origin.coordinates.lat, draft.origin.coordinates.lon) ||
    !validCoordinate(draft.destination.coordinates.lat, draft.destination.coordinates.lon) ||
    draft.stops.some((stop) =>
      !validCoordinate(stop.coordinates.lat, stop.coordinates.lon) ||
      (stop.source !== "user" && (!Number.isSafeInteger(stop.attractionId) || stop.attractionId <= 0))
    ) ||
    [
      draft.summary.distanceKm,
      draft.summary.durationSeconds,
      draft.baselineSummary.distanceKm,
      draft.baselineSummary.durationSeconds,
      draft.composition.actualDetourSeconds,
    ].some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new TripPersistenceError("INVALID_TRIP_DRAFT", "Trip draft geometry is invalid.");
  }
}

function routeGeometryJson(draft: TripDraft) {
  return JSON.stringify(draft.route.geometry);
}

function stopPersistence(stop: DraftStop): {
  stopType: PersistedStopType;
  source: PersistedStopSource;
  attractionId: number | null;
  nameSnapshot: string | null;
  categorySnapshot: string | null;
  metadataSnapshot: AttractionSnapshot | null;
} {
  if (stop.source === "user") {
    return {
      stopType: "waypoint",
      source: "user",
      attractionId: null,
      nameSnapshot: null,
      categorySnapshot: null,
      metadataSnapshot: null,
    };
  }
  return {
    stopType: "attraction",
    source: stop.source === "waypost" ? "waypost" : "user",
    attractionId: stop.attractionId,
    nameSnapshot: stop.label,
    categorySnapshot: stop.category,
    metadataSnapshot: {
      interestCategory: stop.interestCategory,
      rating: stop.rating,
      reviewCount: stop.reviewCount,
      duration: stop.duration,
      visitDuration: stop.visitDuration,
      routeProgress: stop.routeProgress,
      personalizedScore: stop.personalizedScore,
      individualDetourDistanceKm: stop.individualDetourDistanceKm,
      individualDetourDurationSeconds: stop.individualDetourDurationSeconds,
    },
  };
}

async function insertStop(
  client: PoolClient,
  tripVersionId: string,
  position: number,
  stopType: PersistedStopType,
  source: PersistedStopSource,
  attractionId: number | null,
  label: string,
  lat: number,
  lon: number,
  nameSnapshot: string | null,
  categorySnapshot: string | null,
  metadataSnapshot: AttractionSnapshot | null
) {
  await client.query(
    `INSERT INTO public.trip_stops (
      trip_version_id, position, stop_type, source, attraction_id, label, geom,
      name_snapshot, category_snapshot, metadata_snapshot
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10, $11::jsonb
    )`,
    [tripVersionId, position, stopType, source, attractionId, label, lon, lat, nameSnapshot, categorySnapshot, metadataSnapshot ? JSON.stringify(metadataSnapshot) : null]
  );
}

async function replaceStops(client: PoolClient, tripVersionId: string, draft: TripDraft) {
  await client.query("DELETE FROM public.trip_stops WHERE trip_version_id = $1", [tripVersionId]);
  const allStops = [
    { label: draft.origin.label, coordinates: draft.origin.coordinates, stopType: "origin" as const, source: "user" as const, attractionId: null, nameSnapshot: null, categorySnapshot: null, metadataSnapshot: null },
    ...draft.stops.map((stop) => ({ label: stop.label, coordinates: stop.coordinates, ...stopPersistence(stop) })),
    { label: draft.destination.label, coordinates: draft.destination.coordinates, stopType: "destination" as const, source: "user" as const, attractionId: null, nameSnapshot: null, categorySnapshot: null, metadataSnapshot: null },
  ];
  for (const [position, stop] of allStops.entries()) {
    await insertStop(client, tripVersionId, position, stop.stopType, stop.source, stop.attractionId, stop.label, stop.coordinates.lat, stop.coordinates.lon, stop.nameSnapshot, stop.categorySnapshot, stop.metadataSnapshot);
  }
}

function versionValues(draft: TripDraft, routingEngineVersion: string | null) {
  return [
    JSON.stringify(draft.preferences), routeGeometryJson(draft), draft.summary.distanceKm * 1000,
    draft.summary.durationSeconds, draft.summary.hasToll, draft.summary.hasHighway, draft.summary.hasFerry,
    draft.baselineSummary.distanceKm * 1000, draft.baselineSummary.durationSeconds,
    draft.baselineSummary.hasToll, draft.baselineSummary.hasHighway, draft.baselineSummary.hasFerry,
    draft.composition.actualDetourSeconds, WAYPOST_ROUTING_ENGINE, routingEngineVersion, WAYPOST_PLANNER_VERSION,
  ];
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createTripWithDraft(
  userId: string,
  draft: TripDraft,
  options: { title?: string | null; routingEngineVersion?: string | null } = {}
) {
  assertUuid(userId);
  validateDraft(draft);
  const tripId = await inTransaction(async (client) => {
    const user = await client.query("SELECT 1 FROM public.users WHERE id=$1", [userId]);
    if (!user.rowCount) {
      throw new TripPersistenceError("USER_NOT_FOUND", "Trip owner was not found.");
    }
    const trip = await client.query<{ id: string }>(
      "INSERT INTO public.trips (user_id, title) VALUES ($1, $2) RETURNING id",
      [userId, options.title ?? null]
    );
    const values = versionValues(draft, options.routingEngineVersion ?? null);
    const version = await client.query<{ id: string }>(
      `INSERT INTO public.trip_versions (
        trip_id, version_no, state, preferences, route_geom, distance_m,
        duration_seconds, has_toll, has_highway, has_ferry,
        baseline_distance_m, baseline_duration_seconds, baseline_has_toll,
        baseline_has_highway, baseline_has_ferry, driving_detour_seconds,
        routing_engine, routing_engine_version, planner_version
      ) VALUES (
        $1, 1, 'draft', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
        $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING id`,
      [trip.rows[0].id, ...values]
    );
    await replaceStops(client, version.rows[0].id, draft);
    await client.query("UPDATE public.trips SET current_version_id = $1, updated_at = now() WHERE id = $2", [version.rows[0].id, trip.rows[0].id]);
    return trip.rows[0].id;
  });
  return getTrip(tripId);
}

function toSummary(row: VersionRow, baseline = false): RouteSummary {
  return baseline
    ? { distanceKm: row.baseline_distance_m / 1000, durationSeconds: row.baseline_duration_seconds, hasToll: row.baseline_has_toll, hasHighway: row.baseline_has_highway, hasFerry: row.baseline_has_ferry }
    : { distanceKm: row.distance_m / 1000, durationSeconds: row.duration_seconds, hasToll: row.has_toll, hasHighway: row.has_highway, hasFerry: row.has_ferry };
}

async function loadVersion(client: PoolClient, versionId: string): Promise<PersistedTripVersion | null> {
  const versionResult = await client.query<VersionRow>(
    `SELECT id, version_no, state, preferences, ST_AsGeoJSON(route_geom)::json AS route_geometry,
      distance_m, duration_seconds, has_toll, has_highway, has_ferry,
      baseline_distance_m, baseline_duration_seconds, baseline_has_toll,
      baseline_has_highway, baseline_has_ferry, driving_detour_seconds,
      routing_engine, routing_engine_version, planner_version, created_at, updated_at, finalized_at
     FROM public.trip_versions WHERE id = $1`,
    [versionId]
  );
  if (!versionResult.rowCount) return null;
  const row = versionResult.rows[0];
  const stopsResult = await client.query<StopRow>(
    `SELECT id, position, stop_type, source, attraction_id, label,
      ST_X(geom) AS lon, ST_Y(geom) AS lat,
      name_snapshot, category_snapshot, metadata_snapshot
     FROM public.trip_stops WHERE trip_version_id = $1 ORDER BY position`,
    [versionId]
  );
  return {
    id: row.id, versionNo: row.version_no, state: row.state, preferences: row.preferences,
    route: { type: "Feature", properties: {}, geometry: row.route_geometry },
    summary: toSummary(row), baselineSummary: toSummary(row, true),
    drivingDetourSeconds: row.driving_detour_seconds,
    routingEngine: row.routing_engine, routingEngineVersion: row.routing_engine_version,
    plannerVersion: row.planner_version,
    stops: stopsResult.rows.map((stop): PersistedTripStop => ({
      id: stop.id, position: stop.position, stopType: stop.stop_type, source: stop.source,
      attractionId: stop.attraction_id === null ? null : Number(stop.attraction_id), label: stop.label,
      coordinates: { lat: stop.lat, lon: stop.lon }, nameSnapshot: stop.name_snapshot,
      categorySnapshot: stop.category_snapshot, metadataSnapshot: stop.metadata_snapshot,
    })),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    finalizedAt: row.finalized_at?.toISOString() ?? null,
  };
}

export async function getTrip(tripId: string): Promise<PersistedTrip | null> {
  assertUuid(tripId);
  const client = await getPostgresPool().connect();
  try {
    const result = await client.query<TripRow>("SELECT * FROM public.trips WHERE id = $1", [tripId]);
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return {
      id: row.id, userId: row.user_id, title: row.title, status: row.status,
      currentVersionId: row.current_version_id,
      currentVersion: row.current_version_id ? await loadVersion(client, row.current_version_id) : null,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
  } finally {
    client.release();
  }
}

export async function getCurrentTripVersion(tripId: string) {
  const trip = await getTrip(tripId);
  if (!trip) throw new TripPersistenceError("TRIP_NOT_FOUND", "Trip was not found.");
  if (!trip.currentVersion) throw new TripPersistenceError("CURRENT_VERSION_NOT_FOUND", "Trip has no current version.");
  return trip.currentVersion;
}

type TripListRow = {
  id: string; status: "draft"; current_version_id: string | null;
  version_state: PersistedTripVersionState | null;
  preferences: PersistedTripVersion["preferences"] | null;
  origin_label: string | null; destination_label: string | null;
  attraction_stop_count: string; created_at: Date; updated_at: Date;
};

export async function listTripsForUser(userId: string): Promise<TripListItem[]> {
  assertUuid(userId);
  const result = await getPostgresPool().query<TripListRow>(
    `SELECT t.id, t.status, t.current_version_id,
       v.state AS version_state, v.preferences,
       MAX(s.label) FILTER (WHERE s.stop_type = 'origin') AS origin_label,
       MAX(s.label) FILTER (WHERE s.stop_type = 'destination') AS destination_label,
       COUNT(*) FILTER (WHERE s.stop_type = 'attraction') AS attraction_stop_count,
       t.created_at, t.updated_at
     FROM public.trips t
     LEFT JOIN public.trip_versions v ON v.id = t.current_version_id
     LEFT JOIN public.trip_stops s ON s.trip_version_id = v.id
     WHERE t.user_id = $1
     GROUP BY t.id, v.id
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT 200`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id, status: row.status, currentVersionId: row.current_version_id,
    versionState: row.version_state, originLabel: row.origin_label,
    destinationLabel: row.destination_label,
    attractionStopCount: Number(row.attraction_stop_count), preferences: row.preferences,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  }));
}

export async function getOwnedTrip(userId: string, tripId: string) {
  assertUuid(userId);
  assertUuid(tripId);
  const trip = await getTrip(tripId);
  return trip?.userId === userId ? trip : null;
}

export async function assertTripOwnership(userId: string, tripId: string) {
  const trip = await getOwnedTrip(userId, tripId);
  if (!trip) {
    throw new TripPersistenceError("TRIP_NOT_FOUND", "Trip was not found.");
  }
  return trip;
}

export async function saveOwnedCurrentDraftVersion(
  userId: string,
  tripId: string,
  draft: TripDraft,
  options: { routingEngineVersion?: string | null } = {}
) {
  await assertTripOwnership(userId, tripId);
  return saveCurrentDraftVersion(tripId, draft, options);
}

export async function saveCurrentDraftVersion(
  tripId: string,
  draft: TripDraft,
  options: { routingEngineVersion?: string | null } = {}
) {
  assertUuid(tripId);
  validateDraft(draft);
  await inTransaction(async (client) => {
    const trip = await client.query<{ current_version_id: string | null }>(
      "SELECT current_version_id FROM public.trips WHERE id = $1 FOR UPDATE", [tripId]
    );
    if (!trip.rowCount) throw new TripPersistenceError("TRIP_NOT_FOUND", "Trip was not found.");
    const versionId = trip.rows[0].current_version_id;
    if (!versionId) throw new TripPersistenceError("CURRENT_VERSION_NOT_FOUND", "Trip has no current version.");
    const version = await client.query<{ state: PersistedTripVersionState; trip_id: string }>(
      "SELECT state, trip_id FROM public.trip_versions WHERE id = $1 FOR UPDATE", [versionId]
    );
    if (!version.rowCount || version.rows[0].trip_id !== tripId) {
      throw new TripPersistenceError("CURRENT_VERSION_NOT_FOUND", "Trip current version is invalid.");
    }
    if (version.rows[0].state !== "draft") {
      throw new TripPersistenceError("FINALIZED_VERSION_IMMUTABLE", "A finalized trip version cannot be changed.");
    }
    const values = versionValues(draft, options.routingEngineVersion ?? null);
    await client.query(
      `UPDATE public.trip_versions SET
        preferences=$1::jsonb, route_geom=ST_SetSRID(ST_GeomFromGeoJSON($2),4326),
        distance_m=$3, duration_seconds=$4, has_toll=$5, has_highway=$6, has_ferry=$7,
        baseline_distance_m=$8, baseline_duration_seconds=$9, baseline_has_toll=$10,
        baseline_has_highway=$11, baseline_has_ferry=$12, driving_detour_seconds=$13,
        routing_engine=$14, routing_engine_version=$15, planner_version=$16, updated_at=now()
       WHERE id=$17`,
      [...values, versionId]
    );
    await replaceStops(client, versionId, draft);
    await client.query("UPDATE public.trips SET updated_at=now() WHERE id=$1", [tripId]);
  });
  return getCurrentTripVersion(tripId);
}
