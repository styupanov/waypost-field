import "server-only";
import { getPostgresPool } from "@/lib/db/postgres";
import type { AttractionEnrichment } from "@/types/attraction-enrichment";

export type EnrichmentAttraction = { id: number; name: string; category: string; rating: number; reviewCount: number; latitude: number; longitude: number };

export async function findEnrichmentAttraction(id: number): Promise<EnrichmentAttraction | null> {
  const result = await getPostgresPool().query<{ id: string; name: string; category: string; rating: number; review_count: string; latitude: number; longitude: number }>(`
    SELECT id::text,name,category,rating::double precision AS rating,review_count::text,
      ST_Y(geom::geometry) AS latitude,ST_X(geom::geometry) AS longitude
    FROM public.attractions WHERE id=$1 AND source_group='attractions'`, [id]);
  const row = result.rows[0];
  return row ? { id: Number(row.id), name: row.name, category: row.category, rating: row.rating, reviewCount: Number(row.review_count), latitude: row.latitude, longitude: row.longitude } : null;
}

export async function findCachedEnrichment(id: number, provider: string, model: string, promptVersion: string) {
  const result = await getPostgresPool().query<{ content: Omit<AttractionEnrichment, "sourceUrls">; source_urls: string[] }>(`
    SELECT content,source_urls FROM public.attraction_ai_enrichment
    WHERE attraction_id=$1 AND provider=$2 AND model=$3 AND prompt_version=$4 AND expires_at > now()`, [id, provider, model, promptVersion]);
  const row = result.rows[0];
  return row ? { shortDescription: row.content.shortDescription, whyVisit: row.content.whyVisit, highlights: row.content.highlights, practicalNote: row.content.practicalNote, sourceUrls: row.source_urls } : null;
}

export async function saveCachedEnrichment(id: number, provider: string, model: string, promptVersion: string, value: AttractionEnrichment, expiresAt: Date, metadata?: { googlePlaceId: string }) {
  const { sourceUrls, ...content } = value;
  await getPostgresPool().query(`INSERT INTO public.attraction_ai_enrichment
    (attraction_id,provider,model,prompt_version,content,source_urls,generated_at,expires_at)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),$7)
    ON CONFLICT (attraction_id,provider,model,prompt_version) DO UPDATE SET content=EXCLUDED.content,source_urls=EXCLUDED.source_urls,generated_at=now(),expires_at=EXCLUDED.expires_at`,
    [id, provider, model, promptVersion, JSON.stringify({ ...content, grounding: metadata ? { externalProvider: "google_places", googlePlaceId: metadata.googlePlaceId } : undefined }), JSON.stringify(sourceUrls), expiresAt]);
}
