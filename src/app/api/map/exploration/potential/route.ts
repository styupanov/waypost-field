import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { explorationPotentialResponse } from "@/lib/exploration-potential/response";

export async function GET(request: Request) {
  return explorationPotentialResponse(await authenticatedWaypostUserId(), request);
}
