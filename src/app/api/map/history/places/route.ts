import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { visitedPlacesResponse } from "@/lib/personal-history/responses";
export async function GET(request: Request) { return visitedPlacesResponse(await authenticatedWaypostUserId(), request); }
