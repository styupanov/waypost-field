import "server-only";
import { CoverageRequestError, parseCoverageRequest } from "./coverage-request.ts";
import { getPersonalCoverage } from "./personal-coverage.ts";

export async function coverageResponseForUser(userId: string | null, request: Request) {
  if (!userId) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in is required." } }, { status: 401 });
  try {
    const { zoom, viewport } = parseCoverageRequest(request.url);
    return Response.json(await getPersonalCoverage(userId, zoom, viewport));
  } catch (error) {
    if (error instanceof CoverageRequestError) return Response.json({ error: { code: "INVALID_COVERAGE_VIEW", message: error.message } }, { status: 400 });
    console.error("Personal coverage could not be loaded.");
    return Response.json({ error: { code: "COVERAGE_UNAVAILABLE", message: "Personal coverage is unavailable." } }, { status: 500 });
  }
}
