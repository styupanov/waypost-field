import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { createTripWithDraft, getTrip, saveOwnedCurrentDraftVersion } from "../src/lib/trips/repository.ts";
import type { TripDraft } from "../src/types/trip.ts";
import { isOvernightStop } from "../src/types/trip.ts";

const baseUrl = process.env.WAYPOST_TEST_URL ?? "http://localhost:3103";
const pool = getPostgresPool(); let userId: string | null = null; let tripId: string | null = null;
async function post<T>(path: string, body: unknown): Promise<T> { const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`${path}: ${response.status}`); return response.json() as Promise<T>; }
try {
  const buildStarted = performance.now();
  const draft = await post<TripDraft>("/api/draft", { origin: { label: "Charlotte", coordinates: { lat: 35.2271, lon: -80.8431 } }, stop: null, destination: { label: "Denver", coordinates: { lat: 39.7392, lon: -104.9903 } }, preferences: { preferredCategories: [], excludedCategories: [], detourTolerance: "balanced", stopStyle: "balanced", drivingPace: "balanced", selectedTripDays: 4, tripDaysOverridden: true }, hardUserAttractions: [], existingUserOvernights: [], previousSelectedTripDays: null });
  const buildDurationMilliseconds = performance.now() - buildStarted;
  const overnights = draft.stops.filter(isOvernightStop);
  assert.equal(overnights.length, 3); assert.deepEqual(overnights.map((stop) => stop.nightIndex), [1,2,3]); assert.ok(overnights.every((stop) => stop.source === "waypost"));
  const user = await pool.query<{id:string}>("INSERT INTO public.users(auth_subject) VALUES($1) RETURNING id", [`overnight-smoke-${randomUUID()}`]); userId = user.rows[0].id;
  const created = await createTripWithDraft(userId, draft); assert.ok(created?.currentVersion); tripId = created.id; const versionId = created.currentVersion!.id;
  const loaded = await getTrip(tripId); const persisted = loaded!.currentVersion!.stops.filter((stop) => stop.stopType === "overnight"); assert.equal(persisted.length, 3); assert.ok(persisted.every((stop) => stop.settlementGeonameId && stop.nightIndex && stop.overnightMetadata));
  assert.deepEqual(loaded!.currentVersion!.dayPlans, draft.dayPlans); assert.deepEqual(loaded!.currentVersion!.stops.slice(1, -1).map((stop) => stop.label), draft.stops.map((stop) => stop.label));
  const nightTwo = draft.overnightAlternatives.find((night) => night.nightIndex === 2)!; const alternative = nightTwo.candidates.find((item) => item.geonameId !== overnights[1].geonameId)!;
  const changed = await post<TripDraft>("/api/draft/overnight", { draft, nightIndex: 2, geonameId: alternative.geonameId }); const changedStop = changed.stops.filter(isOvernightStop).find((stop) => stop.nightIndex === 2)!; assert.equal(changedStop.source, "user");
  const saved = await saveOwnedCurrentDraftVersion(userId, tripId, changed); assert.equal(saved.id, versionId); assert.equal(saved.versionNo, 1); assert.equal(saved.stops.find((stop) => stop.stopType === "overnight" && stop.nightIndex === 2)?.source, "user");
  console.log(JSON.stringify({ buildDurationMilliseconds, baselineSummary: draft.baselineSummary, finalSummary: draft.summary, overnightCount: persisted.length, nightIndexes: persisted.map((stop) => stop.nightIndex), snapshotsComplete: persisted.every((stop) => stop.overnightMetadata !== null), dayPlansRestored: loaded!.currentVersion!.dayPlans.length === draft.dayPlans.length, exactStopOrderRestored: true, selectedPois: draft.stops.filter((stop) => "attractionId" in stop && stop.source === "waypost").map((stop) => ({ name: stop.label, dayIndex: stop.dayIndex })), dayDiagnostics: draft.dayPlans, totalProviderCalls: draft.composition.valhallaCallCount, changedNightSource: "user", sameVersionId: saved.id === versionId, versionNo: saved.versionNo }, null, 2));
} finally { if (tripId) await pool.query("DELETE FROM public.trips WHERE id=$1", [tripId]); if (userId) await pool.query("DELETE FROM public.users WHERE id=$1", [userId]); await pool.end(); }
