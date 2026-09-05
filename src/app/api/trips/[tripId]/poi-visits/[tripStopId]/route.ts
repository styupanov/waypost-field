import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { clearOwnedTripPoiVisit, PoiVisitError, setOwnedTripPoiVisit } from "@/lib/trips/poi-visits";

function error(code:string,message:string,status:number){return NextResponse.json({error:{code,message}},{status});}
function failure(reason:unknown){if(reason instanceof PoiVisitError)return error(reason.code,reason.message,reason.code==="TRIP_NOT_FOUND"?404:409);console.error("Failed to update POI visit confirmation.");return error("POI_VISIT_UPDATE_FAILED","POI visit confirmation could not be updated.",500);}

export async function PUT(request:Request,context:{params:Promise<{tripId:string;tripStopId:string}>}){const userId=await authenticatedWaypostUserId();if(!userId)return error("UNAUTHORIZED","Sign in is required.",401);let body:unknown;try{body=await request.json();}catch{return error("INVALID_POI_VISIT","Request body must be valid JSON.",400);}const outcome=body&&typeof body==="object"?(body as{outcome?:unknown}).outcome:null;if(outcome!=="visited"&&outcome!=="not_visited")return error("INVALID_POI_VISIT","Outcome must be visited or not_visited.",400);try{const{tripId,tripStopId}=await context.params;return NextResponse.json(await setOwnedTripPoiVisit(userId,tripId,tripStopId,outcome));}catch(reason){return failure(reason);}}

export async function DELETE(_request:Request,context:{params:Promise<{tripId:string;tripStopId:string}>}){const userId=await authenticatedWaypostUserId();if(!userId)return error("UNAUTHORIZED","Sign in is required.",401);try{const{tripId,tripStopId}=await context.params;return NextResponse.json(await clearOwnedTripPoiVisit(userId,tripId,tripStopId));}catch(reason){return failure(reason);}}
