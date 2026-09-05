import "server-only";
import { loadPersonalBaseCoverageCells } from "./coverage-repository.ts";
import { buildPersonalCoverageResponse } from "./map-coverage.ts";
import type { CoverageViewport } from "../../types/coverage.ts";

export async function getPersonalCoverage(userId: string, zoom: number, viewport: CoverageViewport) {
  return buildPersonalCoverageResponse(await loadPersonalBaseCoverageCells(userId), zoom, viewport);
}
