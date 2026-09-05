import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { resolveWaypostUserId } from "../src/lib/users/identity.ts";
import { completeTrip, startTrip, TripLifecycleError } from "../src/lib/trips/lifecycle.ts";
import { finalizeOwnedTrip } from "../src/lib/trips/finalization.ts";
import { refreshFinalRoute } from "../src/lib/trips/final-route-refresh.ts";
import { commitOwnedTripFinalization, createTripWithDraft, getFinalizedTripWorkspace, getOwnedTrip, listTripsForUser } from "../src/lib/trips/repository.ts";
import type { FinalRoutePreview } from "../src/types/final-route.ts";
import type { TripDraft } from "../src/types/trip.ts";

const pool = getPostgresPool();
const userIds: string[] = [];
const tripIds: string[] = [];
const draft: TripDraft = { origin:{label:"A",coordinates:{lat:35,lon:-80}},stop:null,destination:{label:"B",coordinates:{lat:36,lon:-79}},route:{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:[[-80,35],[-79,36]]}},summary:{distanceKm:150,durationSeconds:7200,hasToll:false,hasHighway:true,hasFerry:false},baselineSummary:{distanceKm:150,durationSeconds:7200,hasToll:false,hasHighway:true,hasFerry:false},stops:[],alternatives:[],lastEdit:null,preferences:{preferredCategories:[],excludedCategories:[],detourTolerance:"balanced",stopStyle:"balanced",drivingPace:"balanced",selectedTripDays:1,tripDaysOverridden:true},multiDay:{isMultiDay:false,drivingPace:"balanced",recommendedDays:1,selectedDays:1,nights:0,baselineDrivingHours:2,dayOptions:[1,2]},overnightAlternatives:[],dayPlans:[],composition:{targetPoiCount:1,selectedPoiCount:0,detourBudgetSeconds:1000,actualDetourSeconds:0,actualDetourWasClamped:false,valhallaCallCount:1,corridorCandidateCount:0,candidateCountConsidered:0,candidatesAfterDeduplication:0,opportunityShortlistSize:0,candidatePoolTruncated:false,suggestedVisitDuration:{minimumMinutes:0,maximumMinutes:0,hasUnknown:false}} };
const here: FinalRoutePreview = {provider:"here",route:{type:"LineString",coordinates:[[-80,35],[-79,36]]},summary:{distanceKm:149,durationSeconds:7000,baseDurationSeconds:6900},diagnostics:{waypointCount:2,sectionCount:1,requestDurationMilliseconds:1}};

async function user() { const id=await resolveWaypostUserId(`local:lifecycle-test:${randomUUID()}`); userIds.push(id); return id; }
async function trip(userId:string) { const value=await createTripWithDraft(userId,draft); if(!value?.currentVersion) throw new Error("fixture failed"); tripIds.push(value.id); return value; }
async function snapshot(tripId:string) { return (await pool.query(`SELECT t.current_version_id,v.version_no,v.state,v.finalized_at,encode(ST_AsEWKB(v.route_geom),'hex') route_hash,(SELECT count(*)::int FROM public.trip_stops WHERE trip_version_id=v.id) stop_count,(SELECT count(*)::int FROM public.trip_credit_ledger WHERE user_id=t.user_id) ledger_count,(SELECT balance FROM public.trip_credit_accounts WHERE user_id=t.user_id) balance,(SELECT encode(ST_AsEWKB(route_geom),'hex') FROM public.provider_route_cache WHERE trip_version_id=v.id) cache_hash FROM public.trips t JOIN public.trip_versions v ON v.id=t.current_version_id WHERE t.id=$1`,[tripId])).rows[0]; }

try {
  const owner=await user(); const other=await user(); const main=await trip(owner); const version=main.currentVersion!;
  await commitOwnedTripFinalization(owner,main.id,version.id,version.updatedAt,here);
  const beforeStart=await snapshot(main.id); const startBefore=Date.now();
  const started=await startTrip(owner,main.id); assert.equal(started.status,"active"); assert.ok(started.startedAt); assert.equal(started.endedAt,null); assert.ok(new Date(started.startedAt!).getTime()>=startBefore);
  const startedRetry=await startTrip(owner,main.id); assert.equal(startedRetry.startedAt,started.startedAt);
  assert.deepEqual(await snapshot(main.id),beforeStart);
  await assert.rejects(()=>startTrip(other,main.id),(error:unknown)=>error instanceof TripLifecycleError&&error.code==="TRIP_NOT_FOUND");
  await assert.rejects(()=>completeTrip(other,main.id),(error:unknown)=>error instanceof TripLifecycleError&&error.code==="TRIP_NOT_FOUND");
  const activeReload=await getOwnedTrip(owner,main.id); assert.equal(activeReload?.status,"active"); assert.equal(activeReload?.startedAt,started.startedAt);
  const activeWorkspace=await getFinalizedTripWorkspace(owner,main.id); assert.equal(activeWorkspace?.tripStatus,"active");
  let activeFinalizeCalls=0; const activeFinalize=await finalizeOwnedTrip(owner,main.id,{calculateRoute:async()=>{activeFinalizeCalls+=1;return here;}}); assert.equal(activeFinalize.tripStatus,"active"); assert.equal(activeFinalizeCalls,0);
  await pool.query("UPDATE public.provider_route_cache SET fetched_at=now()-interval '31 days',expires_at=now()-interval '1 second' WHERE trip_version_id=$1",[version.id]);
  const activeRefresh=await refreshFinalRoute(owner,main.id,{calculateRoute:async()=>here}); assert.equal(activeRefresh.tripStatus,"active"); assert.equal((await getOwnedTrip(owner,main.id))?.status,"active");
  const beforeComplete=await snapshot(main.id); const completed=await completeTrip(owner,main.id); assert.equal(completed.status,"completed_unconfirmed"); assert.equal(completed.startedAt,started.startedAt); assert.ok(completed.endedAt);
  const completedRetry=await completeTrip(owner,main.id); assert.equal(completedRetry.endedAt,completed.endedAt); assert.deepEqual(await snapshot(main.id),beforeComplete);
  await assert.rejects(()=>startTrip(owner,main.id),(error:unknown)=>error instanceof TripLifecycleError&&error.code==="TRIP_NOT_READY_TO_START");
  const completedReload=await getOwnedTrip(owner,main.id); assert.equal(completedReload?.status,"completed_unconfirmed"); assert.equal(completedReload?.endedAt,completed.endedAt);
  assert.equal((await getFinalizedTripWorkspace(owner,main.id))?.tripStatus,"completed_unconfirmed");
  let completedFinalizeCalls=0; const completedFinalize=await finalizeOwnedTrip(owner,main.id,{calculateRoute:async()=>{completedFinalizeCalls+=1;return here;}}); assert.equal(completedFinalize.tripStatus,"completed_unconfirmed"); assert.equal(completedFinalizeCalls,0);
  await pool.query("UPDATE public.provider_route_cache SET fetched_at=now()-interval '31 days',expires_at=now()-interval '1 second' WHERE trip_version_id=$1",[version.id]);
  const completedRefresh=await refreshFinalRoute(owner,main.id,{calculateRoute:async()=>here}); assert.equal(completedRefresh.tripStatus,"completed_unconfirmed");
  const listed=(await listTripsForUser(owner)).find((item)=>item.id===main.id); assert.equal(listed?.status,"completed_unconfirmed"); assert.equal(listed?.startedAt,started.startedAt); assert.equal(listed?.endedAt,completed.endedAt);

  const draftOwner=await user(); const draftTrip=await trip(draftOwner);
  await assert.rejects(()=>startTrip(draftOwner,draftTrip.id),(error:unknown)=>error instanceof TripLifecycleError&&error.code==="TRIP_NOT_READY_TO_START");
  await assert.rejects(()=>completeTrip(draftOwner,draftTrip.id),(error:unknown)=>error instanceof TripLifecycleError&&error.code==="TRIP_NOT_ACTIVE");
  const plannedOwner=await user(); const planned=await trip(plannedOwner); await commitOwnedTripFinalization(plannedOwner,planned.id,planned.currentVersion!.id,planned.currentVersion!.updatedAt,here);
  await assert.rejects(()=>completeTrip(plannedOwner,planned.id),(error:unknown)=>error instanceof TripLifecycleError&&error.code==="TRIP_NOT_ACTIVE");
  console.log("Trip lifecycle transitions, retries, invalid transitions, ownership, persistence, finalized snapshot/cache, credit, and finalize-retry invariants passed.");
} finally {
  for (const id of tripIds) await pool.query("DELETE FROM public.trips WHERE id=$1",[id]);
  if(userIds.length) await pool.query("DELETE FROM public.users WHERE id=ANY($1::uuid[])",[userIds]);
  await pool.end();
}
