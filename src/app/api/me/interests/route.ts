import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { getUserInterestsResponse, putUserInterestsResponse } from "@/lib/user-interests/responses";

export async function GET() {
  return getUserInterestsResponse(await authenticatedWaypostUserId());
}

export async function PUT(request: Request) {
  return putUserInterestsResponse(await authenticatedWaypostUserId(), request);
}
