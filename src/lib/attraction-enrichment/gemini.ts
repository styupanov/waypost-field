import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { parseAttractionEnrichment } from "@/lib/attraction-enrichment/validation";
import type { EnrichmentAttraction } from "@/lib/attraction-enrichment/repository";
import type { VerifiedGooglePlace } from "@/lib/attraction-enrichment/google-places";

export type GeminiSynthesisDiagnostic = { reason: "GEMINI_ACCEPTED" | "GEMINI_EMPTY_RESPONSE" | "GEMINI_JSON_PARSE_FAILED" | "GEMINI_SCHEMA_INVALID"; structuredValidation: boolean };

export async function generateVerifiedPlaceEnrichment(attraction: EnrichmentAttraction, place: VerifiedGooglePlace) {
  const apiKey = process.env.GEMINI_API_KEY; const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) throw new Error("Gemini attraction enrichment is not configured.");
  const factualContext = {
    waypost: { attractionId: attraction.id, name: attraction.name, category: attraction.category, latitude: attraction.latitude, longitude: attraction.longitude },
    verifiedGooglePlace: { googlePlaceId: place.googlePlaceId, displayName: place.displayName, formattedAddress: place.formattedAddress, latitude: place.latitude, longitude: place.longitude, types: place.types, websiteAvailable: Boolean(place.websiteUri) },
  };
  let response;
  try {
    response = await new GoogleGenAI({ apiKey }).models.generateContent({ model,
      contents: `Write concise visitor context using ONLY the supplied verified factual JSON. Do not add unsupported facts. Do not invent hours, prices, closures, accessibility, features, history, awards, or amenities. Never create source URLs, routing metrics, ratings, or review counts. practicalNote may use only the explicit formatted address or verified website availability; otherwise set it to null. If context is sparse, stay conservative.\n${JSON.stringify(factualContext)}`,
      config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, required: ["shortDescription", "whyVisit", "highlights", "practicalNote"], properties: {
        shortDescription: { type: Type.STRING, minLength: "1", maxLength: "500" }, whyVisit: { type: Type.STRING, minLength: "1", maxLength: "300" },
        highlights: { type: Type.ARRAY, minItems: "2", maxItems: "4", items: { type: Type.STRING, minLength: "1", maxLength: "180" } },
        practicalNote: { type: Type.STRING, nullable: true, minLength: "1", maxLength: "300" },
      } } },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("Attraction enrichment synthesis failed", { attractionId: attraction.id, googlePlaceId: place.googlePlaceId, model, reason: "GEMINI_PROVIDER_ERROR", errorName: error instanceof Error ? error.name : "UnknownError" });
    throw error;
  }
  if (!response.text) return { enrichment: null, diagnostics: { reason: "GEMINI_EMPTY_RESPONSE", structuredValidation: false } satisfies GeminiSynthesisDiagnostic };
  let value: unknown;
  try { value = JSON.parse(response.text); } catch { return { enrichment: null, diagnostics: { reason: "GEMINI_JSON_PARSE_FAILED", structuredValidation: false } satisfies GeminiSynthesisDiagnostic }; }
  const validated = parseAttractionEnrichment(value, ["https://validation.invalid"]);
  const enrichment = validated ? { shortDescription: validated.shortDescription, whyVisit: validated.whyVisit, highlights: validated.highlights, practicalNote: validated.practicalNote } : null;
  const diagnostics: GeminiSynthesisDiagnostic = { reason: enrichment ? "GEMINI_ACCEPTED" : "GEMINI_SCHEMA_INVALID", structuredValidation: Boolean(enrichment) };
  if (process.env.NODE_ENV !== "production") console.info("Attraction enrichment synthesis", { attractionId: attraction.id, googlePlaceId: place.googlePlaceId, model, ...diagnostics });
  return { enrichment, diagnostics };
}
