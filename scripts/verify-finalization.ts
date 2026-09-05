import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { commitTripFinalizationTransaction, HERE_ROUTE_CACHE_TTL_DAYS, TripPersistenceError } from "../src/lib/trips/repository.ts";
import type { FinalRoutePreview } from "../src/types/final-route.ts";

const client = await getPostgresPool().connect();
const userId = randomUUID(); const otherUserId = randomUUID(); const tripId = randomUUID(); const versionId = randomUUID();
const route: FinalRoutePreview = { provider: "here", route: { type: "LineString", coordinates: [[-80, 35], [-79, 36]] }, summary: { distanceKm: 150.125, durationSeconds: 7201, baseDurationSeconds: 7000 }, diagnostics: { waypointCount: 2, sectionCount: 1, requestDurationMilliseconds: 50 } };
try {
  await client.query("BEGIN");
  await client.query("INSERT INTO public.users (id, auth_subject) VALUES ($1,$2),($3,$4)", [userId, `finalize-a-${userId}`, otherUserId, `finalize-b-${otherUserId}`]);
  await client.query("INSERT INTO public.trips (id,user_id,status) VALUES ($1,$2,'draft')", [tripId,userId]);
  const version = await client.query<{ updated_at: Date }>(`INSERT INTO public.trip_versions (id,trip_id,version_no,state,preferences,route_geom,distance_m,duration_seconds,baseline_distance_m,baseline_duration_seconds,driving_detour_seconds,routing_engine,planner_version) VALUES ($1,$2,1,'draft','{}',ST_GeomFromText('LINESTRING(-80 35,-79 36)',4326),150000,7200,150000,7200,0,'valhalla','test') RETURNING updated_at`, [versionId,tripId]);
  await client.query("UPDATE public.trips SET current_version_id=$1 WHERE id=$2", [versionId,tripId]);
  await client.query("INSERT INTO public.trip_stops (trip_version_id,position,stop_type,source,label,geom) VALUES ($1,0,'origin','user','A',ST_Point(-80,35,4326)),($1,1,'destination','user','B',ST_Point(-79,36,4326))", [versionId]);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM public.provider_route_cache WHERE trip_version_id=$1",[versionId])).rows[0].count,0);
  await assert.rejects(() => commitTripFinalizationTransaction(client, otherUserId, tripId, versionId, version.rows[0].updated_at.toISOString(), route), (error: unknown) => error instanceof TripPersistenceError && error.code === "TRIP_NOT_FOUND");
  await assert.rejects(() => commitTripFinalizationTransaction(client, userId, tripId, versionId, new Date(0).toISOString(), route), (error: unknown) => error instanceof TripPersistenceError && error.code === "TRIP_CHANGED_DURING_FINALIZATION");
  const result = await commitTripFinalizationTransaction(client, userId, tripId, versionId, version.rows[0].updated_at.toISOString(), route);
  assert.equal(result.tripStatus,"planned"); assert.equal(result.versionState,"finalized"); assert.equal(result.provider,"here");
  assert.equal(new Date(result.cache.expiresAt).getTime()-new Date(result.cache.fetchedAt).getTime(),HERE_ROUTE_CACHE_TTL_DAYS*86400000);
  const state = (await client.query("SELECT t.status,v.state,v.finalization_provider,ST_GeometryType(c.route_geom) AS geometry_type,ST_SRID(c.route_geom) AS srid FROM public.trips t JOIN public.trip_versions v ON v.id=t.current_version_id JOIN public.provider_route_cache c ON c.trip_version_id=v.id WHERE t.id=$1",[tripId])).rows[0];
  assert.deepEqual(state,{status:"planned",state:"finalized",finalization_provider:"here",geometry_type:"ST_LineString",srid:4326});
  for (const mutation of [
    ["UPDATE public.trip_versions SET preferences='{}' WHERE id=$1",versionId],
    ["UPDATE public.trip_stops SET label='changed' WHERE trip_version_id=$1",versionId],
    ["INSERT INTO public.trip_stops (trip_version_id,position,stop_type,source,label,geom) VALUES ($1,2,'waypoint','user','X',ST_Point(-78,37,4326))",versionId],
    ["DELETE FROM public.trip_stops WHERE trip_version_id=$1",versionId],
  ] as const) {
    await client.query("SAVEPOINT immutable_check");
    await assert.rejects(() => client.query(mutation[0],[mutation[1]]));
    await client.query("ROLLBACK TO SAVEPOINT immutable_check");
  }
  await client.query("UPDATE public.provider_route_cache SET expires_at=expires_at + interval '1 second' WHERE trip_version_id=$1",[versionId]);
  console.log("Finalization transaction, ownership, concurrency, TTL, immutability, and cache-mutability checks passed.");
} finally { await client.query("ROLLBACK"); client.release(); await getPostgresPool().end(); }
