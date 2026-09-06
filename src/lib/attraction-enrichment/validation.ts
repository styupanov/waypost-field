import type { AttractionEnrichment } from "@/types/attraction-enrichment";

function concise(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
}

export function parseAttractionEnrichment(value: unknown, sourceUrls: string[]): AttractionEnrichment | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (!concise(item.shortDescription, 500) || !concise(item.whyVisit, 300) || !Array.isArray(item.highlights) || item.highlights.length < 2 || item.highlights.length > 4 || !item.highlights.every((highlight) => concise(highlight, 180))) return null;
  if (item.practicalNote !== null && item.practicalNote !== undefined && !concise(item.practicalNote, 300)) return null;
  const urls = [...new Set(sourceUrls.filter((url) => { try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; } }))].slice(0, 8);
  if (!urls.length) return null;
  return {
    shortDescription: item.shortDescription.trim(), whyVisit: item.whyVisit.trim(),
    highlights: (item.highlights as string[]).map((highlight) => highlight.trim()),
    practicalNote: typeof item.practicalNote === "string" ? item.practicalNote.trim() : null,
    sourceUrls: urls,
  };
}

export function enrichmentContentSchemaIsValid(value: unknown) {
  return parseAttractionEnrichment(value, ["https://diagnostic.invalid/"]) !== null;
}
