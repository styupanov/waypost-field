import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "../db/postgres.ts";
import {
  WAYPOST_PLANNER_VERSION,
  WAYPOST_ROUTING_ENGINE,
} from "../trip/planner-version.ts";
import { isOvernightStop, type TripDraft, type ItineraryStop } from "../../types/trip.ts";
import type {
  AttractionSnapshot,
  PersistedStopSource,
  PersistedStopType,
  PersistedTrip,
  PersistedTripStop,
  PersistedTripVersion,
  PersistedTripVersionState,
  PersistedTripStatus,
  TripListItem,
} from "@/types/trip-persistence";
import type { RouteSummary } from "@/types/route";
import type { FinalRoutePreview, FinalizedTripResult, FinalizedTripWorkspace } from "@/types/final-route";
import { consumeFinalizationCredit } from "../credits/repository.ts";

export class TripPersistenceError extends Error {
  readonly code:
    | "INVALID_TRIP_DRAFT"
    | "INVALID_IDENTIFIER"
    | "USER_NOT_FOUND"
    | "TRIP_NOT_FOUND"
    | "CURRENT_VERSION_NOT_FOUND"
    | "FINALIZED_VERSION_IMMUTABLE"
    | "FINALIZED_CACHE_MISSING"
    | "TRIP_CHANGED_DURING_FINALIZATION"
    | "TRIP_NOT_FINALIZED"
    | "FINALIZATION_PROVIDER_UNSUPPORTED";

  constructor(
    code:
      | "INVALID_TRIP_DRAFT"
      | "INVALID_IDENTIFIER"
      | "USER_NOT_FOUND"
      | "TRIP_NOT_FOUND"
      | "CURRENT_VERSION_NOT_FOUND"
      | "FINALIZED_VERSION_IMMUTABLE"
      | "FINALIZED_CACHE_MISSING"
      | "TRIP_CHANGED_DURING_FINALIZATION"
      | "TRIP_NOT_FINALIZED"
      | "FINALIZATION_PROVIDER_UNSUPPORTED",
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
  status: PersistedTripStatus;
  current_version_id: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  travel_confirmation_at: Date | null;
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
  day_planning_metadata: import("../../types/trip.ts").DraftDayPlan[];
  created_at: Date;
  updated_at: Date;
  finalized_at: Date | null;
  finalization_provider: "here" | null;
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
  settlement_geoname_id: string | number | null;
  night_index: number | null;
  admin1_snapshot: string | null;
  feature_code_snapshot: string | null;
  population_snapshot: string | number | null;
  overnight_metadata: import("@/types/trip").DraftOvernightStop | null;
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
      (!isOvernightStop(stop) && stop.source !== "user" && (!Number.isSafeInteger(stop.attractionId) || stop.attractionId <= 0)) ||
      (isOvernightStop(stop) && (!Number.isSafeInteger(stop.nightIndex) || stop.nightIndex <= 0 || !Number.isSafeInteger(stop.geonameId)))
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

function stopPersistence(stop: ItineraryStop) {
  if (isOvernightStop(stop)) return { stopType: "overnight" as const, source: stop.source, attractionId: null, settlementGeonameId: stop.geonameId, nightIndex: stop.nightIndex, nameSnapshot: stop.label, categorySnapshot: null, metadataSnapshot: null, admin1Snapshot: stop.admin1Code, featureCodeSnapshot: stop.featureCode, populationSnapshot: stop.population, overnightMetadata: stop };
  if (stop.source === "user") {
    return {
      stopType: "waypoint",
      source: "user",
      attractionId: null,
      nameSnapshot: null,
      categorySnapshot: null,
      metadataSnapshot: null,
      settlementGeonameId: null, nightIndex: null, admin1Snapshot: null, featureCodeSnapshot: null, populationSnapshot: null, overnightMetadata: null,
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
      dayIndex: stop.dayIndex ?? null,
    },
    settlementGeonameId: null, nightIndex: null, admin1Snapshot: null, featureCodeSnapshot: null, populationSnapshot: null, overnightMetadata: null,
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
  metadataSnapshot: AttractionSnapshot | null,
  settlementGeonameId: number | null,
  nightIndex: number | null,
  admin1Snapshot: string | null,
  featureCodeSnapshot: string | null,
  populationSnapshot: number | null,
  overnightMetadata: import("@/types/trip").DraftOvernightStop | null
) {
  await client.query(
    `INSERT INTO public.trip_stops (
      trip_version_id, position, stop_type, source, attraction_id, label, geom,
      name_snapshot, category_snapshot, metadata_snapshot, settlement_geoname_id,
      night_index, admin1_snapshot, feature_code_snapshot, population_snapshot, overnight_metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17::jsonb
    )`,
    [tripVersionId, position, stopType, source, attractionId, label, lon, lat, nameSnapshot, categorySnapshot, metadataSnapshot ? JSON.stringify(metadataSnapshot) : null, settlementGeonameId, nightIndex, admin1Snapshot, featureCodeSnapshot, populationSnapshot, overnightMetadata ? JSON.stringify(overnightMetadata) : null]
  );
}

async function replaceStops(client: PoolClient, tripVersionId: string, draft: TripDraft) {
  await client.query("DELETE FROM public.trip_stops WHERE trip_version_id = $1", [tripVersionId]);
  const allStops = [
    { label: draft.origin.label, coordinates: draft.origin.coordinates, stopType: "origin" as const, source: "user" as const, attractionId: null, nameSnapshot: null, categorySnapshot: null, metadataSnapshot: null, settlementGeonameId: null, nightIndex: null, admin1Snapshot: null, featureCodeSnapshot: null, populationSnapshot: null, overnightMetadata: null },
    ...draft.stops.map((stop) => ({ label: stop.label, coordinates: stop.coordinates, ...stopPersistence(stop) })),
    { label: draft.destination.label, coordinates: draft.destination.coordinates, stopType: "destination" as const, source: "user" as const, attractionId: null, nameSnapshot: null, categorySnapshot: null, metadataSnapshot: null, settlementGeonameId: null, nightIndex: null, admin1Snapshot: null, featureCodeSnapshot: null, populationSnapshot: null, overnightMetadata: null },
  ];
  for (const [position, stop] of allStops.entries()) {
    await insertStop(client, tripVersionId, position, stop.stopType as PersistedStopType, stop.source as PersistedStopSource, stop.attractionId, stop.label, stop.coordinates.lat, stop.coordinates.lon, stop.nameSnapshot, stop.categorySnapshot, stop.metadataSnapshot, stop.settlementGeonameId, stop.nightIndex, stop.admin1Snapshot, stop.featureCodeSnapshot, stop.populationSnapshot, stop.overnightMetadata);
  }
}

function versionValues(draft: TripDraft, routingEngineVersion: string | null) {
  return [
    JSON.stringify(draft.preferences), routeGeometryJson(draft), draft.summary.distanceKm * 1000,
    draft.summary.durationSeconds, draft.summary.hasToll, draft.summary.hasHighway, draft.summary.hasFerry,
    draft.baselineSummary.distanceKm * 1000, draft.baselineSummary.durationSeconds,
    draft.baselineSummary.hasToll, draft.baselineSummary.hasHighway, draft.baselineSummary.hasFerry,
    draft.composition.actualDetourSeconds, WAYPOST_ROUTING_ENGINE, routingEngineVersion, WAYPOST_PLANNER_VERSION,
    JSON.stringify(draft.dayPlans),
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
        routing_engine, routing_engine_version, planner_version, day_planning_metadata
      ) VALUES (
        $1, 1, 'draft', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
        $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb
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
      routing_engine, routing_engine_version, planner_version, day_planning_metadata, created_at, updated_at, finalized_at,
      finalization_provider
     FROM public.trip_versions WHERE id = $1`,
    [versionId]
  );
  if (!versionResult.rowCount) return null;
  const row = versionResult.rows[0];
  const stopsResult = await client.query<StopRow>(
    `SELECT id, position, stop_type, source, attraction_id, label,
      ST_X(geom) AS lon, ST_Y(geom) AS lat,
      name_snapshot, category_snapshot, metadata_snapshot, settlement_geoname_id,
      night_index, admin1_snapshot, feature_code_snapshot, population_snapshot, overnight_metadata
     FROM public.trip_stops WHERE trip_version_id = $1 ORDER BY position`,
    [versionId]
  );
  return {
    id: row.id, versionNo: row.version_no, state: row.state, preferences: row.preferences,
    route: { type: "Feature", properties: {}, geometry: row.route_geometry },
    summary: toSummary(row), baselineSummary: toSummary(row, true),
    drivingDetourSeconds: row.driving_detour_seconds,
    routingEngine: row.routing_engine, routingEngineVersion: row.routing_engine_version,
    plannerVersion: row.planner_version, dayPlans: row.day_planning_metadata ?? [],
    stops: stopsResult.rows.map((stop): PersistedTripStop => ({
      id: stop.id, position: stop.position, stopType: stop.stop_type, source: stop.source,
      attractionId: stop.attraction_id === null ? null : Number(stop.attraction_id), label: stop.label,
      coordinates: { lat: stop.lat, lon: stop.lon }, nameSnapshot: stop.name_snapshot,
      categorySnapshot: stop.category_snapshot, metadataSnapshot: stop.metadata_snapshot,
      settlementGeonameId: stop.settlement_geoname_id === null ? null : Number(stop.settlement_geoname_id), nightIndex: stop.night_index,
      admin1Snapshot: stop.admin1_snapshot, featureCodeSnapshot: stop.feature_code_snapshot,
      populationSnapshot: stop.population_snapshot === null ? null : Number(stop.population_snapshot), overnightMetadata: stop.overnight_metadata,
    })),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    finalizedAt: row.finalized_at?.toISOString() ?? null,
    finalizationProvider: row.finalization_provider,
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
      startedAt: row.started_at?.toISOString() ?? null,
      endedAt: row.ended_at?.toISOString() ?? null,
      travelConfirmationAt: row.travel_confirmation_at?.toISOString() ?? null,
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
  id: string; status: PersistedTripStatus; current_version_id: string | null;
  version_state: PersistedTripVersionState | null;
  preferences: PersistedTripVersion["preferences"] | null;
  origin_label: string | null; destination_label: string | null;
  attraction_stop_count: string; started_at: Date | null; ended_at: Date | null; travel_confirmation_at: Date | null; created_at: Date; updated_at: Date;
};

export async function listTripsForUser(userId: string): Promise<TripListItem[]> {
  assertUuid(userId);
  const result = await getPostgresPool().query<TripListRow>(
    `SELECT t.id, t.status, t.current_version_id,
       v.state AS version_state, v.preferences,
       MAX(s.label) FILTER (WHERE s.stop_type = 'origin') AS origin_label,
       MAX(s.label) FILTER (WHERE s.stop_type = 'destination') AS destination_label,
       COUNT(*) FILTER (WHERE s.stop_type = 'attraction') AS attraction_stop_count,
       t.started_at, t.ended_at, t.travel_confirmation_at, t.created_at, t.updated_at
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
    startedAt: row.started_at?.toISOString() ?? null, endedAt: row.ended_at?.toISOString() ?? null,
    travelConfirmationAt: row.travel_confirmation_at?.toISOString() ?? null,
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
        routing_engine=$14, routing_engine_version=$15, planner_version=$16,
        day_planning_metadata=$17::jsonb, updated_at=now()
       WHERE id=$18`,
      [...values, versionId]
    );
    await replaceStops(client, versionId, draft);
    await client.query("UPDATE public.trips SET updated_at=now() WHERE id=$1", [tripId]);
  });
  return getCurrentTripVersion(tripId);
}

export const HERE_ROUTE_CACHE_TTL_DAYS = 30;

type FinalRouteCacheRow = {
  trip_version_id: string;
  route_geometry: { type: "LineString"; coordinates: [number, number][] };
  distance_meters: string | number;
  duration_seconds: string | number;
  base_duration_seconds: string | number | null;
  fetched_at: Date;
  expires_at: Date;
};

function finalizedResult(tripId: string, versionId: string, tripStatus: import("@/types/final-route").ExecutableTripStatus, finalizedAt: string, row: FinalRouteCacheRow): FinalizedTripResult {
  return {
    tripId, versionId, tripStatus, versionState: "finalized", finalizedAt, provider: "here",
    finalRoute: {
      route: row.route_geometry,
      summary: {
        distanceKm: Number(row.distance_meters) / 1000,
        durationSeconds: Number(row.duration_seconds),
        baseDurationSeconds: row.base_duration_seconds === null ? null : Number(row.base_duration_seconds),
      },
    },
    cache: { status: "valid", fetchedAt: row.fetched_at.toISOString(), expiresAt: row.expires_at.toISOString() },
  };
}

async function loadFinalRouteCache(client: PoolClient, versionId: string) {
  const result = await client.query<FinalRouteCacheRow>(
    `SELECT trip_version_id, ST_AsGeoJSON(route_geom)::json AS route_geometry,
      distance_meters, duration_seconds, base_duration_seconds, fetched_at, expires_at
     FROM public.provider_route_cache WHERE trip_version_id=$1 AND provider='here'`,
    [versionId]
  );
  return result.rows[0] ?? null;
}

export async function getExistingFinalization(userId: string, tripId: string): Promise<FinalizedTripResult | null> {
  const workspace = await getFinalizedTripWorkspace(userId, tripId);
  if (!workspace) return null;
  if (workspace.cache.status !== "valid") throw new TripPersistenceError("FINALIZED_CACHE_MISSING", `Finalized route cache is ${workspace.cache.status}.`);
  return { tripId: workspace.tripId, versionId: workspace.versionId, tripStatus: workspace.tripStatus, versionState: "finalized", finalizedAt: workspace.finalizedAt, provider: "here", finalRoute: workspace.cache.finalRoute, cache: { status: "valid", fetchedAt: workspace.cache.fetchedAt, expiresAt: workspace.cache.expiresAt } };
}

export async function getFinalizedTripWorkspace(userId: string, tripId: string): Promise<FinalizedTripWorkspace | null> {
  const trip = await getOwnedTrip(userId, tripId);
  if (!trip) throw new TripPersistenceError("TRIP_NOT_FOUND", "Trip was not found.");
  const version = trip.currentVersion;
  if (!version) throw new TripPersistenceError("CURRENT_VERSION_NOT_FOUND", "Trip has no current version.");
  if (version.state !== "finalized") return null;
  if (trip.status === "draft") throw new TripPersistenceError("TRIP_NOT_FINALIZED", "Trip is not finalized.");
  if (version.finalizationProvider !== "here") throw new TripPersistenceError("FINALIZATION_PROVIDER_UNSUPPORTED", "Finalized route provider is unsupported.");
  const client = await getPostgresPool().connect();
  try {
    const row = await loadFinalRouteCache(client, version.id);
    const base = { tripId: trip.id, versionId: version.id, tripStatus: trip.status, startedAt: trip.startedAt, endedAt: trip.endedAt, travelConfirmationAt: trip.travelConfirmationAt, versionState: "finalized" as const, finalizedAt: version.finalizedAt!, provider: "here" as const };
    if (!row) return { ...base, cache: { status: "missing", provider: "here", fetchedAt: null, expiresAt: null } };
    if (row.expires_at.getTime() <= Date.now()) return { ...base, cache: { status: "expired", provider: "here", fetchedAt: row.fetched_at.toISOString(), expiresAt: row.expires_at.toISOString() } };
    const result = finalizedResult(trip.id, version.id, trip.status, version.finalizedAt!, row);
    return { ...base, cache: { status: "valid", provider: "here", fetchedAt: result.cache.fetchedAt, expiresAt: result.cache.expiresAt, finalRoute: result.finalRoute } };
  } finally { client.release(); }
}

export async function commitOwnedTripFinalization(
  userId: string,
  tripId: string,
  expectedVersionId: string,
  expectedUpdatedAt: string,
  route: FinalRoutePreview
): Promise<FinalizedTripResult> {
  assertUuid(userId); assertUuid(tripId); assertUuid(expectedVersionId);
  return inTransaction((client) => commitTripFinalizationTransaction(client, userId, tripId, expectedVersionId, expectedUpdatedAt, route));
}

export async function commitTripFinalizationTransaction(
  client: PoolClient,
  userId: string,
  tripId: string,
  expectedVersionId: string,
  expectedUpdatedAt: string,
  route: FinalRoutePreview
) {
    const tripResult = await client.query<{ user_id: string; status: "draft" | "planned"; current_version_id: string | null }>(
      "SELECT user_id, status, current_version_id FROM public.trips WHERE id=$1 FOR UPDATE", [tripId]
    );
    const trip = tripResult.rows[0];
    if (!trip || trip.user_id !== userId) throw new TripPersistenceError("TRIP_NOT_FOUND", "Trip was not found.");
    if (trip.current_version_id !== expectedVersionId) throw new TripPersistenceError("TRIP_CHANGED_DURING_FINALIZATION", "Trip changed during finalization.");
    const versionResult = await client.query<{ state: PersistedTripVersionState; updated_at: Date; finalized_at: Date | null }>(
      "SELECT state, updated_at, finalized_at FROM public.trip_versions WHERE id=$1 AND trip_id=$2 FOR UPDATE", [expectedVersionId, tripId]
    );
    const version = versionResult.rows[0];
    if (!version || version.state !== "draft" || version.updated_at.toISOString() !== expectedUpdatedAt) {
      throw new TripPersistenceError("TRIP_CHANGED_DURING_FINALIZATION", "Trip changed during finalization.");
    }
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + HERE_ROUTE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const cacheResult = await client.query<FinalRouteCacheRow>(
      `INSERT INTO public.provider_route_cache (
        trip_version_id, provider, route_geom, distance_meters, duration_seconds,
        base_duration_seconds, waypoint_count, section_count, fetched_at, expires_at
      ) VALUES ($1, 'here', ST_SetSRID(ST_GeomFromGeoJSON($2),4326), $3, $4, $5, $6, $7, $8, $9)
      RETURNING trip_version_id, ST_AsGeoJSON(route_geom)::json AS route_geometry,
        distance_meters, duration_seconds, base_duration_seconds, fetched_at, expires_at`,
      [expectedVersionId, JSON.stringify(route.route), Math.round(route.summary.distanceKm * 1000), Math.round(route.summary.durationSeconds), route.summary.baseDurationSeconds === null ? null : Math.round(route.summary.baseDurationSeconds), route.diagnostics.waypointCount, route.diagnostics.sectionCount, fetchedAt, expiresAt]
    );
    const finalizedAt = new Date();
    await client.query("UPDATE public.trip_versions SET state='finalized', finalized_at=$1, finalization_provider='here', updated_at=now() WHERE id=$2", [finalizedAt, expectedVersionId]);
    await client.query("UPDATE public.trips SET status='planned', updated_at=now() WHERE id=$1", [tripId]);
    await consumeFinalizationCredit(client, userId, expectedVersionId);
  return finalizedResult(tripId, expectedVersionId, "planned", finalizedAt.toISOString(), cacheResult.rows[0]);
}

export async function refreshOwnedFinalRouteCache(userId: string, tripId: string, expectedVersionId: string, route: FinalRoutePreview) {
  assertUuid(userId); assertUuid(tripId); assertUuid(expectedVersionId);
  return inTransaction((client) => refreshFinalRouteCacheTransaction(client, userId, tripId, expectedVersionId, route));
}

export async function refreshFinalRouteCacheTransaction(client: PoolClient, userId: string, tripId: string, expectedVersionId: string, route: FinalRoutePreview) {
    const tripResult = await client.query<{ user_id: string; status: PersistedTripStatus; current_version_id: string | null }>("SELECT user_id,status,current_version_id FROM public.trips WHERE id=$1 FOR UPDATE", [tripId]);
    const trip = tripResult.rows[0];
    if (!trip || trip.user_id !== userId) throw new TripPersistenceError("TRIP_NOT_FOUND", "Trip was not found.");
    if (trip.status === "draft" || trip.current_version_id !== expectedVersionId) throw new TripPersistenceError("TRIP_NOT_FINALIZED", "Trip is not finalized.");
    const versionResult = await client.query<{ state: PersistedTripVersionState; finalized_at: Date; finalization_provider: string | null }>("SELECT state,finalized_at,finalization_provider FROM public.trip_versions WHERE id=$1 AND trip_id=$2 FOR UPDATE", [expectedVersionId, tripId]);
    const version = versionResult.rows[0];
    if (!version || version.state !== "finalized") throw new TripPersistenceError("TRIP_NOT_FINALIZED", "Trip is not finalized.");
    if (version.finalization_provider !== "here") throw new TripPersistenceError("FINALIZATION_PROVIDER_UNSUPPORTED", "Finalized route provider is unsupported.");
    const current = await loadFinalRouteCache(client, expectedVersionId);
    if (current && current.expires_at.getTime() > Date.now()) return finalizedResult(tripId, expectedVersionId, trip.status, version.finalized_at.toISOString(), current);
    const fetchedAt = new Date(); const expiresAt = new Date(fetchedAt.getTime() + HERE_ROUTE_CACHE_TTL_DAYS * 86_400_000);
    const cacheResult = await client.query<FinalRouteCacheRow>(
      `INSERT INTO public.provider_route_cache (trip_version_id,provider,route_geom,distance_meters,duration_seconds,base_duration_seconds,waypoint_count,section_count,fetched_at,expires_at)
       VALUES ($1,'here',ST_SetSRID(ST_GeomFromGeoJSON($2),4326),$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (trip_version_id) DO UPDATE SET provider='here',route_geom=EXCLUDED.route_geom,distance_meters=EXCLUDED.distance_meters,duration_seconds=EXCLUDED.duration_seconds,base_duration_seconds=EXCLUDED.base_duration_seconds,waypoint_count=EXCLUDED.waypoint_count,section_count=EXCLUDED.section_count,fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at
       RETURNING trip_version_id,ST_AsGeoJSON(route_geom)::json AS route_geometry,distance_meters,duration_seconds,base_duration_seconds,fetched_at,expires_at`,
      [expectedVersionId, JSON.stringify(route.route), Math.round(route.summary.distanceKm * 1000), Math.round(route.summary.durationSeconds), route.summary.baseDurationSeconds === null ? null : Math.round(route.summary.baseDurationSeconds), route.diagnostics.waypointCount, route.diagnostics.sectionCount, fetchedAt, expiresAt]
    );
  return finalizedResult(tripId, expectedVersionId, trip.status, version.finalized_at.toISOString(), cacheResult.rows[0]);
}
