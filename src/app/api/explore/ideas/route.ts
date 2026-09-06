import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { emptyExploreStageTimings, generateExploreIdeas } from "@/lib/explore-planning/service";
import { parseExplorePlanningRequest } from "@/lib/explore-planning/validation";

export async function POST(request: Request) {
  const requestStarted = performance.now(); const stages = emptyExploreStageTimings();
  const authStarted = performance.now(); const userId = await authenticatedWaypostUserId(); const authMs = performance.now() - authStarted;
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  const validationStarted = performance.now();
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const input = parseExplorePlanningRequest(body);
  if (!input) return Response.json({ error: "Invalid Explore planning request." }, { status: 400 });
  const requestValidationMs = performance.now() - validationStarted;
  try {
    const result = await generateExploreIdeas(input, stages);
    const responseStarted = performance.now(); const response = Response.json(result); const responseConstructionMs = performance.now() - responseStarted;
    const totalLatencyMs = performance.now() - requestStarted;
    const sequentiallyAttributedMs = authMs + requestValidationMs + stages.h3BoundaryMs + stages.candidateCanonicalMappingMs + stages.candidateRepositoryMs + stages.candidateResultMappingMs + stages.matrixPreparationMs + stages.matrixWallClockMs + stages.exactRoutingWallClockMs + stages.resultRankingMs + responseConstructionMs;
    console.info("Explore request timing", {
      requestValidationMs: Math.round(requestValidationMs), authMs: Math.round(authMs), userInterestLoadMs: 0,
      ...Object.fromEntries(Object.entries(stages).map(([key, value]) => [key, Math.round(value)])),
      responseConstructionMs: Math.round(responseConstructionMs), totalLatencyMs: Math.round(totalLatencyMs),
      unaccountedMs: Math.max(0, Math.round(totalLatencyMs - sequentiallyAttributedMs)),
      sqlStageNote: "candidateFilteringMs/candidateStaticScoringMs/candidateSortingMs execute inside candidateRepositoryMs",
    });
    return response;
  }
  catch (error) { console.error("Explore idea generation failed", error); return Response.json({ error: "Unable to find trip ideas right now." }, { status: 503 }); }
}
