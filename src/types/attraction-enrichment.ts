export type AttractionEnrichment = {
  shortDescription: string;
  whyVisit: string;
  highlights: string[];
  practicalNote: string | null;
  sourceUrls: string[];
};

export type AttractionEnrichmentResponse = {
  enrichment: AttractionEnrichment | null;
};
