import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { areaExplorationResponse } from "@/lib/exploration-intelligence/response";

export async function GET(request: Request) {
  return areaExplorationResponse(await authenticatedWaypostUserId(), request);
}
