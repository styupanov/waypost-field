import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "../db/postgres.ts";
import type { PoiVisitItem, PoiVisitOutcome, PoiVisitsResponse } from "../../types/poi-visits.ts";

export class PoiVisitError extends Error {
  readonly code: "TRIP_NOT_FOUND" | "TRIP_NOT_TRAVELED" | "TRIP_LIFECYCLE_CONFLICT" | "TRIP_STOP_NOT_CONFIRMABLE";
  constructor(code: PoiVisitError["code"], message: string) { super(message); this.name = "PoiVisitError"; this.code = code; }
}

type EligibleTrip = { currentVersionId: string };

async function lockEligibleTrip(client: PoolClient, userId: string, tripId: string): Promise<EligibleTrip> {
  const result = await client.query<{ user_id: string; status: string; current_version_id: string | null; version_state: string | null }>(
    `SELECT t.user_id,t.status,t.current_version_id,v.state AS version_state
     FROM public.trips t LEFT JOIN public.trip_versions v ON v.id=t.current_version_id
     WHERE t.id=$1 FOR UPDATE OF t`,
    [tripId]
  );
  const trip=result.rows[0];
  if(!trip||trip.user_id!==userId) throw new PoiVisitError("TRIP_NOT_FOUND","Trip was not found.");
  if(trip.status!=="traveled") throw new PoiVisitError("TRIP_NOT_TRAVELED","POI visits can only be confirmed for a traveled trip.");
  if(!trip.current_version_id||trip.version_state!=="finalized") throw new PoiVisitError("TRIP_LIFECYCLE_CONFLICT","The traveled trip does not have a finalized version.");
  return {currentVersionId:trip.current_version_id};
}

async function transaction<T>(work:(client:PoolClient)=>Promise<T>){const client=await getPostgresPool().connect();try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}

export async function getOwnedTripPoiVisits(userId:string,tripId:string):Promise<PoiVisitsResponse>{
  return transaction(async(client)=>{
    const trip=await lockEligibleTrip(client,userId,tripId);
    const result=await client.query<{id:string;label:string;source:"user"|"waypost";attraction_id:string|number|null;outcome:PoiVisitOutcome|null;confirmed_at:Date|null}>(
      `SELECT s.id,s.label,s.source,s.attraction_id,c.outcome,c.confirmed_at
       FROM public.trip_stops s
       LEFT JOIN public.trip_poi_visit_confirmations c
         ON c.trip_version_id=s.trip_version_id AND c.trip_stop_id=s.id AND c.user_id=$2
       WHERE s.trip_version_id=$1 AND s.stop_type='attraction'
       ORDER BY s.position`,[trip.currentVersionId,userId]);
    return {tripId,versionId:trip.currentVersionId,items:result.rows.map((row):PoiVisitItem=>({tripStopId:row.id,name:row.label,source:row.source,attractionId:row.attraction_id===null?null:Number(row.attraction_id),outcome:row.outcome,confirmedAt:row.confirmed_at?.toISOString()??null}))};
  });
}

export async function setOwnedTripPoiVisit(userId:string,tripId:string,tripStopId:string,outcome:PoiVisitOutcome):Promise<PoiVisitItem>{
  return transaction(async(client)=>{
    const trip=await lockEligibleTrip(client,userId,tripId);
    const stopResult=await client.query<{id:string;label:string;source:"user"|"waypost";attraction_id:string|number|null}>("SELECT id,label,source,attraction_id FROM public.trip_stops WHERE id=$1 AND trip_version_id=$2 AND stop_type='attraction'",[tripStopId,trip.currentVersionId]);
    const stop=stopResult.rows[0];if(!stop)throw new PoiVisitError("TRIP_STOP_NOT_CONFIRMABLE","Trip stop is not a confirmable attraction.");
    const existing=await client.query<{outcome:PoiVisitOutcome;confirmed_at:Date}>("SELECT outcome,confirmed_at FROM public.trip_poi_visit_confirmations WHERE trip_version_id=$1 AND trip_stop_id=$2 FOR UPDATE",[trip.currentVersionId,tripStopId]);
    let confirmedAt:Date;
    if(existing.rows[0]?.outcome===outcome){confirmedAt=existing.rows[0].confirmed_at;}else{
      const saved=await client.query<{confirmed_at:Date}>(`INSERT INTO public.trip_poi_visit_confirmations(user_id,trip_version_id,trip_stop_id,attraction_id,outcome,confirmed_at)
        VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(trip_version_id,trip_stop_id) DO UPDATE SET outcome=EXCLUDED.outcome,confirmed_at=now(),updated_at=now() RETURNING confirmed_at`,[userId,trip.currentVersionId,tripStopId,stop.attraction_id,outcome]);confirmedAt=saved.rows[0].confirmed_at;
    }
    return {tripStopId:stop.id,name:stop.label,source:stop.source,attractionId:stop.attraction_id===null?null:Number(stop.attraction_id),outcome,confirmedAt:confirmedAt.toISOString()};
  });
}

export async function clearOwnedTripPoiVisit(userId:string,tripId:string,tripStopId:string){
  return transaction(async(client)=>{const trip=await lockEligibleTrip(client,userId,tripId);const stop=await client.query("SELECT 1 FROM public.trip_stops WHERE id=$1 AND trip_version_id=$2 AND stop_type='attraction'",[tripStopId,trip.currentVersionId]);if(!stop.rowCount)throw new PoiVisitError("TRIP_STOP_NOT_CONFIRMABLE","Trip stop is not a confirmable attraction.");await client.query("DELETE FROM public.trip_poi_visit_confirmations WHERE user_id=$1 AND trip_version_id=$2 AND trip_stop_id=$3",[userId,trip.currentVersionId,tripStopId]);return {tripId,versionId:trip.currentVersionId,tripStopId,outcome:null,confirmedAt:null};});
}
