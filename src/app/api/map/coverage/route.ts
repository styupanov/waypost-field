import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { coverageResponseForUser } from "@/lib/coverage/coverage-response";

export async function GET(request: Request) {
  return coverageResponseForUser(await authenticatedWaypostUserId(), request);
}
