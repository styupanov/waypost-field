import "server-only";
import { loadPersonalCoverageBounds } from "./coverage-repository.ts";

export async function coverageBoundsResponseForUser(userId: string | null) {
  if (!userId) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in is required." } }, { status: 401 });
  try {
    return Response.json(await loadPersonalCoverageBounds(userId));
  } catch {
    console.error("Personal coverage bounds could not be loaded.");
    return Response.json({ error: { code: "COVERAGE_UNAVAILABLE", message: "Personal coverage is unavailable." } }, { status: 500 });
  }
}
