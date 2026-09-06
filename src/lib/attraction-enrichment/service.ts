import "server-only";
import { generateVerifiedPlaceEnrichment } from "@/lib/attraction-enrichment/gemini";
import { resolveVerifiedGooglePlace } from "@/lib/attraction-enrichment/google-places";
import { findCachedEnrichment, findEnrichmentAttraction, saveCachedEnrichment } from "@/lib/attraction-enrichment/repository";
import type { AttractionEnrichment } from "@/types/attraction-enrichment";

export const ATTRACTION_ENRICHMENT_PROVIDER = "google_places";
export const ATTRACTION_ENRICHMENT_PROMPT_VERSION = "p1.26-v3";
export const ATTRACTION_ENRICHMENT_TTL_DAYS = 30;

type Dependencies = {
  findAttraction: typeof findEnrichmentAttraction;
  findCached: typeof findCachedEnrichment;
  resolvePlace: typeof resolveVerifiedGooglePlace;
  generate: typeof generateVerifiedPlaceEnrichment;
  save: typeof saveCachedEnrichment;
};
const defaults: Dependencies = { findAttraction: findEnrichmentAttraction, findCached: findCachedEnrichment, resolvePlace: resolveVerifiedGooglePlace, generate: generateVerifiedPlaceEnrichment, save: saveCachedEnrichment };
const inFlight = new Map<string, Promise<AttractionEnrichment | null>>();

export async function getAttractionEnrichment(attractionId: number, dependencies: Dependencies = defaults) {
  const model = process.env.GEMINI_MODEL;
  if (!model) return null;
  const cached = await dependencies.findCached(attractionId, ATTRACTION_ENRICHMENT_PROVIDER, model, ATTRACTION_ENRICHMENT_PROMPT_VERSION);
  if (cached) return cached;
  const key = `${attractionId}:${model}:${ATTRACTION_ENRICHMENT_PROMPT_VERSION}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const generation = (async () => {
    const attraction = await dependencies.findAttraction(attractionId);
    if (!attraction) return null;
    const resolution = await dependencies.resolvePlace(attraction);
    if (!resolution.place) {
      if (process.env.NODE_ENV !== "production") console.warn("Attraction enrichment place resolution rejected", { attractionId, ...resolution.diagnostics });
      return null;
    }
    if (!resolution.place.sourceUrls.length) return null;
    let generated;
    try { generated = await dependencies.generate(attraction, resolution.place); }
    catch { return null; }
    if (!generated.enrichment) return null;
    const value = { ...generated.enrichment, sourceUrls: resolution.place.sourceUrls };
    const expiresAt = new Date(Date.now() + ATTRACTION_ENRICHMENT_TTL_DAYS * 24 * 60 * 60 * 1000);
    try { await dependencies.save(attractionId, ATTRACTION_ENRICHMENT_PROVIDER, model, ATTRACTION_ENRICHMENT_PROMPT_VERSION, value, expiresAt, { googlePlaceId: resolution.place.googlePlaceId }); }
    catch (error) {
      if (process.env.NODE_ENV !== "production") console.warn("Attraction enrichment cache write failed", { attractionId, model, reason: "GEMINI_CACHE_WRITE_FAILED", errorName: error instanceof Error ? error.name : "UnknownError" });
      throw error;
    }
    return value;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, generation);
  return generation;
}
