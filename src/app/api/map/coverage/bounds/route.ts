import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { coverageBoundsResponseForUser } from "@/lib/coverage/coverage-bounds-response";

export async function GET() {
  return coverageBoundsResponseForUser(await authenticatedWaypostUserId());
}
