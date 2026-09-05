import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { resolveWaypostUserId } from "../src/lib/users/identity.ts";
import { completeTrip, confirmTripTravelOutcome, isTripEligibleForTravelCoverage, startTrip, TripLifecycleError, undoTripTravelConfirmation } from "../src/lib/trips/lifecycle.ts";
import { finalizeOwnedTrip } from "../src/lib/trips/finalization.ts";
import { refreshFinalRoute } from "../src/lib/trips/final-route-refresh.ts";
import { commitOwnedTripFinalization, createTripWithDraft, getFinalizedTripWorkspace, getOwnedTrip, listTripsForUser } from "../src/lib/trips/repository.ts";
import type { FinalRoutePreview } from "../src/types/final-route.ts";
import type { TripDraft } from "../src/types/trip.ts";

const pool=getPostgresPool(); const users:string[]=[]; const trips:string[]=[];
const draft:TripDraft={origin:{label:"A",coordinates:{lat:35,lon:-80}},stop:null,destination:{label:"B",coordinates:{lat:36,lon:-79}},route:{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:[[-80,35],[-79,36]]}},summary:{distanceKm:150,durationSeconds:7200,hasToll:false,hasHighway:true,hasFerry:false},baselineSummary:{distanceKm:150,durationSeconds:7200,hasToll:false,hasHighway:true,hasFerry:false},stops:[],alternatives:[],lastEdit:null,preferences:{preferredCategories:[],excludedCategories:[],detourTolerance:"balanced",stopStyle:"balanced",drivingPace:"balanced",selectedTripDays:1,tripDaysOverridden:true},multiDay:{isMultiDay:false,drivingPace:"balanced",recommendedDays:1,selectedDays:1,nights:0,baselineDrivingHours:2,dayOptions:[1,2]},overnightAlternatives:[],dayPlans:[],composition:{targetPoiCount:1,selectedPoiCount:0,detourBudgetSeconds:1000,actualDetourSeconds:0,actualDetourWasClamped:false,valhallaCallCount:1,corridorCandidateCount:0,candidateCountConsidered:0,candidatesAfterDeduplication:0,opportunityShortlistSize:0,candidatePoolTruncated:false,suggestedVisitDuration:{minimumMinutes:0,maximumMinutes:0,hasUnknown:false}}};
const here:FinalRoutePreview={provider:"here",route:{type:"LineString",coordinates:[[-80,35],[-79,36]]},summary:{distanceKm:149,durationSeconds:7000,baseDurationSeconds:6900},diagnostics:{waypointCount:2,sectionCount:1,requestDurationMilliseconds:1}};
async function user(){const id=await resolveWaypostUserId(`local:travel-confirmation-test:${randomUUID()}`);users.push(id);return id;}
async function makeTrip(userId:string){const trip=await createTripWithDraft(userId,draft);if(!trip?.currentVersion)throw new Error("fixture failed");trips.push(trip.id);return trip;}
async function makeCompleted(userId:string){const trip=await makeTrip(userId);await commitOwnedTripFinalization(userId,trip.id,trip.currentVersion!.id,trip.currentVersion!.updatedAt,here);await startTrip(userId,trip.id);await completeTrip(userId,trip.id);return (await getOwnedTrip(userId,trip.id))!;}
async function immutableSnapshot(tripId:string){return(await pool.query(`SELECT t.started_at,t.ended_at,t.current_version_id,v.state,v.version_no,v.finalized_at,v.finalization_provider,encode(ST_AsEWKB(v.route_geom),'hex') route_hash,(SELECT count(*)::int FROM trip_stops WHERE trip_version_id=v.id) stop_count,(SELECT encode(ST_AsEWKB(route_geom),'hex') FROM provider_route_cache WHERE trip_version_id=v.id) cache_hash,(SELECT balance FROM trip_credit_accounts WHERE user_id=t.user_id) balance,(SELECT count(*)::int FROM trip_credit_ledger WHERE user_id=t.user_id) ledger_count FROM trips t JOIN trip_versions v ON v.id=t.current_version_id WHERE t.id=$1`,[tripId])).rows[0];}

try{
  const owner=await user();const foreign=await user();const traveledTrip=await makeCompleted(owner);const immutableBefore=await immutableSnapshot(traveledTrip.id);const confirmedAfter=Date.now();
  const traveled=await confirmTripTravelOutcome(owner,traveledTrip.id,"traveled");assert.equal(traveled.status,"traveled");assert.ok(traveled.travelConfirmationAt);assert.ok(new Date(traveled.travelConfirmationAt!).getTime()<=Date.now());assert.ok(new Date(traveled.travelConfirmationAt!).getTime()>=confirmedAfter-1000);assert.equal(isTripEligibleForTravelCoverage(traveled.status),true);
  const traveledRetry=await confirmTripTravelOutcome(owner,traveledTrip.id,"traveled");assert.equal(traveledRetry.travelConfirmationAt,traveled.travelConfirmationAt);
  await assert.rejects(()=>confirmTripTravelOutcome(owner,traveledTrip.id,"not_traveled"),(e:unknown)=>e instanceof TripLifecycleError&&e.code==="TRAVEL_CONFIRMATION_CONFLICT");
  await assert.rejects(()=>confirmTripTravelOutcome(foreign,traveledTrip.id,"traveled"),(e:unknown)=>e instanceof TripLifecycleError&&e.code==="TRIP_NOT_FOUND");
  assert.deepEqual(await immutableSnapshot(traveledTrip.id),immutableBefore);
  const traveledReload=await getOwnedTrip(owner,traveledTrip.id);assert.equal(traveledReload?.status,"traveled");assert.equal(traveledReload?.travelConfirmationAt,traveled.travelConfirmationAt);assert.equal((await getFinalizedTripWorkspace(owner,traveledTrip.id))?.tripStatus,"traveled");
  let finalizeCalls=0;const finalizedRetry=await finalizeOwnedTrip(owner,traveledTrip.id,{calculateRoute:async()=>{finalizeCalls+=1;return here;}});assert.equal(finalizedRetry.tripStatus,"traveled");assert.equal(finalizeCalls,0);
  await pool.query("UPDATE provider_route_cache SET fetched_at=now()-interval '31 days',expires_at=now()-interval '1 second' WHERE trip_version_id=$1",[traveledTrip.currentVersionId]);
  const refreshed=await refreshFinalRoute(owner,traveledTrip.id,{calculateRoute:async()=>here});assert.equal(refreshed.tripStatus,"traveled");const afterRefresh=await getOwnedTrip(owner,traveledTrip.id);assert.equal(afterRefresh?.travelConfirmationAt,traveled.travelConfirmationAt);
  const undone=await undoTripTravelConfirmation(owner,traveledTrip.id);assert.equal(undone.status,"completed_unconfirmed");assert.equal(undone.travelConfirmationAt,null);assert.equal(undone.startedAt,traveled.startedAt);assert.equal(undone.endedAt,traveled.endedAt);
  const undoRetry=await undoTripTravelConfirmation(owner,traveledTrip.id);assert.equal(undoRetry.status,"completed_unconfirmed");assert.equal(undoRetry.travelConfirmationAt,null);

  const notOwner=await user();const notTrip=await makeCompleted(notOwner);const notTraveled=await confirmTripTravelOutcome(notOwner,notTrip.id,"not_traveled");assert.equal(notTraveled.status,"not_traveled");assert.equal(isTripEligibleForTravelCoverage(notTraveled.status),false);
  const notRetry=await confirmTripTravelOutcome(notOwner,notTrip.id,"not_traveled");assert.equal(notRetry.travelConfirmationAt,notTraveled.travelConfirmationAt);
  await assert.rejects(()=>confirmTripTravelOutcome(notOwner,notTrip.id,"traveled"),(e:unknown)=>e instanceof TripLifecycleError&&e.code==="TRAVEL_CONFIRMATION_CONFLICT");
  assert.equal((await getOwnedTrip(notOwner,notTrip.id))?.travelConfirmationAt,notTraveled.travelConfirmationAt);
  let notFinalizeCalls=0;assert.equal((await finalizeOwnedTrip(notOwner,notTrip.id,{calculateRoute:async()=>{notFinalizeCalls+=1;return here;}})).tripStatus,"not_traveled");assert.equal(notFinalizeCalls,0);
  await pool.query("UPDATE provider_route_cache SET fetched_at=now()-interval '31 days',expires_at=now()-interval '1 second' WHERE trip_version_id=$1",[notTrip.currentVersionId]);assert.equal((await refreshFinalRoute(notOwner,notTrip.id,{calculateRoute:async()=>here})).tripStatus,"not_traveled");
  assert.equal((await undoTripTravelConfirmation(notOwner,notTrip.id)).status,"completed_unconfirmed");assert.equal((await confirmTripTravelOutcome(notOwner,notTrip.id,"traveled")).status,"traveled");

  const raceOwner=await user();const raceTrip=await makeCompleted(raceOwner);const race=await Promise.allSettled([confirmTripTravelOutcome(raceOwner,raceTrip.id,"traveled"),confirmTripTravelOutcome(raceOwner,raceTrip.id,"not_traveled")]);assert.equal(race.filter((r)=>r.status==="fulfilled").length,1);assert.equal(race.filter((r)=>r.status==="rejected"&&r.reason instanceof TripLifecycleError&&r.reason.code==="TRAVEL_CONFIRMATION_CONFLICT").length,1);
  const raceLoaded=await getOwnedTrip(raceOwner,raceTrip.id);assert.ok(raceLoaded?.status==="traveled"||raceLoaded?.status==="not_traveled");

  const invalidOwner=await user();const draftTrip=await makeTrip(invalidOwner);await assert.rejects(()=>confirmTripTravelOutcome(invalidOwner,draftTrip.id,"traveled"),(e:unknown)=>e instanceof TripLifecycleError&&e.code==="TRIP_NOT_AWAITING_CONFIRMATION");await assert.rejects(()=>undoTripTravelConfirmation(invalidOwner,draftTrip.id),(e:unknown)=>e instanceof TripLifecycleError&&e.code==="TRIP_NOT_AWAITING_CONFIRMATION");
  const plannedOwner=await user();const planned=await makeTrip(plannedOwner);await commitOwnedTripFinalization(plannedOwner,planned.id,planned.currentVersion!.id,planned.currentVersion!.updatedAt,here);await assert.rejects(()=>confirmTripTravelOutcome(plannedOwner,planned.id,"traveled"),(e:unknown)=>e instanceof TripLifecycleError&&e.code==="TRIP_NOT_AWAITING_CONFIRMATION");await startTrip(plannedOwner,planned.id);await assert.rejects(()=>confirmTripTravelOutcome(plannedOwner,planned.id,"traveled"),(e:unknown)=>e instanceof TripLifecycleError&&e.code==="TRIP_NOT_AWAITING_CONFIRMATION");
  const statuses=(await listTripsForUser(owner)).map((trip)=>trip.status);assert.ok(statuses.includes("completed_unconfirmed"));
  console.log("Travel confirmation, reversal, retries, conflicts, concurrency, ownership, persistence, finalized snapshot/cache, credits, and coverage eligibility checks passed.");
}finally{for(const id of trips)await pool.query("DELETE FROM trips WHERE id=$1",[id]);if(users.length)await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])",[users]);await pool.end();}
