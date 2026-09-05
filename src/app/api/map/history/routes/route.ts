import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { traveledRoutesResponse } from "@/lib/personal-history/responses";
export async function GET(request: Request) { return traveledRoutesResponse(await authenticatedWaypostUserId(), request); }
