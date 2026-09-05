import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { getOwnedTripPoiVisits, PoiVisitError } from "@/lib/trips/poi-visits";

function error(code:string,message:string,status:number){return NextResponse.json({error:{code,message}},{status});}
function failure(reason:unknown){if(reason instanceof PoiVisitError)return error(reason.code,reason.message,reason.code==="TRIP_NOT_FOUND"?404:409);console.error("Failed to load POI visit confirmations.");return error("POI_VISITS_FAILED","POI visit confirmations could not be loaded.",500);}

export async function GET(_request:Request,context:{params:Promise<{tripId:string}>}){const userId=await authenticatedWaypostUserId();if(!userId)return error("UNAUTHORIZED","Sign in is required.",401);try{const{tripId}=await context.params;return NextResponse.json(await getOwnedTripPoiVisits(userId,tripId));}catch(reason){return failure(reason);}}
