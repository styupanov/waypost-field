import { randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import {
  createTripWithDraft,
  getCurrentTripVersion,
  getTrip,
  saveCurrentDraftVersion,
  TripPersistenceError,
} from "../src/lib/trips/repository.ts";
import type { TripDraft } from "../src/types/trip.ts";

const applicationUrl = process.env.WAYPOST_TEST_URL ?? "http://localhost:3001";
const pool = getPostgresPool();
let userId: string | null = null;
let tripId: string | null = null;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${applicationUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}.`);
  return response.json() as Promise<T>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

try {
  const initialDraft = await post<TripDraft>("/api/draft", {
    origin: { label: "Charlotte, NC", coordinates: { lat: 35.2271, lon: -80.8431 } },
    stop: null,
    destination: { label: "Maryland test point", coordinates: { lat: 39.13941, lon: -76.8414 } },
    preferences: {
      preferredCategories: ["nature_scenic"],
      excludedCategories: [],
      detourTolerance: "balanced",
      stopStyle: "balanced",
    },
  });
  if (!initialDraft.alternatives[0]) throw new Error("Smoke draft has no alternative to add.");
  const explicitAttractionId = initialDraft.alternatives[0].attractionId;
  const draft = await post<TripDraft>("/api/draft/edit", {
    draft: initialDraft,
    action: { type: "add", attractionId: explicitAttractionId },
  });

  const user = await pool.query<{ id: string }>(
    "INSERT INTO public.users (auth_subject) VALUES ($1) RETURNING id",
    [`persistence-smoke-${randomUUID()}`]
  );
  userId = user.rows[0].id;
  const created = await createTripWithDraft(userId, draft, { title: "Persistence smoke test" });
  if (!created?.currentVersion) throw new Error("Created trip has no current version.");
  tripId = created.id;
  const loadedTrip = await getTrip(tripId);
  if (!loadedTrip?.currentVersion) throw new Error("Saved trip could not be loaded.");
  const firstVersion = await getCurrentTripVersion(tripId);
  const autoStop = firstVersion.stops.find((stop) => stop.source === "waypost");
  const explicitStop = firstVersion.stops.find(
    (stop) => stop.source === "user" && stop.stopType === "attraction"
  );

  const modifiedDraft = await post<TripDraft>("/api/draft/edit", {
    draft,
    action: { type: "remove", attractionId: explicitAttractionId },
  });
  const saved = await saveCurrentDraftVersion(tripId, modifiedDraft);

  await pool.query(
    "UPDATE public.trip_versions SET state='finalized', finalized_at=now() WHERE id=$1",
    [saved.id]
  );
  let finalizedProtection = false;
  try {
    await saveCurrentDraftVersion(tripId, modifiedDraft);
  } catch (error) {
    finalizedProtection =
      error instanceof TripPersistenceError &&
      error.code === "FINALIZED_VERSION_IMMUTABLE";
  }

  console.log(JSON.stringify({
    createdVersionNo: firstVersion.versionNo,
    getTripCurrentVersionMatches: loadedTrip.currentVersion.id === firstVersion.id,
    savedVersionNo: saved.versionNo,
    sameVersionId: firstVersion.id === saved.id,
    routeCoordinateCountInput: draft.route.geometry.coordinates.length,
    routeCoordinateCountLoaded: firstVersion.route.geometry.coordinates.length,
    routeCoordinatesPreserved:
      JSON.stringify(draft.route.geometry.coordinates) ===
      JSON.stringify(firstVersion.route.geometry.coordinates),
    distancePreserved: draft.summary.distanceKm === firstVersion.summary.distanceKm,
    durationPreserved: draft.summary.durationSeconds === firstVersion.summary.durationSeconds,
    preferencesPreserved:
      canonicalJson(draft.preferences) === canonicalJson(firstVersion.preferences),
    stopPositions: firstVersion.stops.map((stop) => stop.position),
    stopTypes: firstVersion.stops.map((stop) => stop.stopType),
    automaticSource: autoStop?.source ?? null,
    explicitAttractionSource: explicitStop?.source ?? null,
    explicitAttractionIdPreserved: explicitStop?.attractionId === explicitAttractionId,
    explicitSnapshotPreserved:
      explicitStop?.nameSnapshot !== null &&
      explicitStop?.categorySnapshot !== null &&
      explicitStop?.metadataSnapshot !== null,
    savedRouteCoordinateCount: saved.route.geometry.coordinates.length,
    finalizedProtection,
  }, null, 2));
} finally {
  if (tripId) await pool.query("DELETE FROM public.trips WHERE id=$1", [tripId]);
  if (userId) await pool.query("DELETE FROM public.users WHERE id=$1", [userId]);
  await pool.end();
}
