import "server-only";
import { cellToBoundary } from "h3-js";
import { getPostgresPool } from "@/lib/db/postgres";
import { RAW_CATEGORY_TO_INTEREST_CATEGORY, mapRawAttractionCategory } from "@/lib/attractions/category-mapping";
import type { InterestCategory } from "@/types/preferences";

export type ExploreAttractionCandidate = {
  id: number; name: string; category: string; rating: number; reviewCount: number;
  latitude: number; longitude: number; duration: string | null; qualityScore: number;
};

export type ExploreRepositoryTimings = { h3BoundaryMs: number; candidateCanonicalMappingMs: number; candidateRepositoryMs: number; candidateResultMappingMs: number };

type Row = { id: string; name: string; category: string; rating: number; review_count: string; latitude: number; longitude: number; duration: string | null; quality_score: number; total_count: string };

export async function findExploreAttractionCandidates(args: { h3Index: string; interests: InterestCategory[]; limit: number }, timings?: ExploreRepositoryTimings) {
  const boundaryStarted = performance.now();
  const boundary = cellToBoundary(args.h3Index);
  const ring = [...boundary.map(([lat, lng]) => [lng, lat]), [boundary[0][1], boundary[0][0]]];
  if (timings) timings.h3BoundaryMs = performance.now() - boundaryStarted;
  const mappingStarted = performance.now();
  const mappedSourceCategories = Object.entries(RAW_CATEGORY_TO_INTEREST_CATEGORY)
    .filter(([, mapped]) => mapped !== null && args.interests.includes(mapped))
    .map(([source]) => source);
  if (timings) timings.candidateCanonicalMappingMs = performance.now() - mappingStarted;
  if (args.interests.length > 0 && mappedSourceCategories.length === 0) return { candidates: [], totalCount: 0 };

  const repositoryStarted = performance.now();
  const result = await getPostgresPool().query<Row>(`
    WITH area AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
    ), source_mean AS MATERIALIZED (
      SELECT avg(rating)::double precision AS mean_rating
      FROM public.attractions
      WHERE source_group = 'attractions' AND rating IS NOT NULL
    ), eligible AS (
      SELECT a.*, count(*) OVER()::text AS total_count,
        ((a.review_count::double precision / (a.review_count + 100)) * a.rating
          + (100::double precision / (a.review_count + 100)) * source_mean.mean_rating) / 5 * 100 AS quality_score
      FROM public.attractions a CROSS JOIN area CROSS JOIN source_mean
      WHERE a.source_group = 'attractions'
        AND a.geom IS NOT NULL AND a.name IS NOT NULL AND a.category IS NOT NULL
        AND a.rating IS NOT NULL AND a.review_count IS NOT NULL
        AND ST_Covers(area.geom, a.geom::geometry)
        AND ($2::boolean OR a.category = ANY($3::text[]))
    )
    SELECT id::text, name, category, rating::double precision AS rating,
      review_count::text, ST_Y(geom::geometry) AS latitude, ST_X(geom::geometry) AS longitude, duration,
      quality_score, total_count
    FROM eligible
    ORDER BY quality_score DESC, id ASC
    LIMIT $4
  `, [JSON.stringify({ type: "Polygon", coordinates: [ring] }), args.interests.length === 0, mappedSourceCategories, args.limit]);
  if (timings) timings.candidateRepositoryMs = performance.now() - repositoryStarted;

  const resultMappingStarted = performance.now();
  const response = {
    totalCount: Number(result.rows[0]?.total_count ?? 0),
    candidates: result.rows.map((row) => ({
      id: Number(row.id), name: row.name, category: row.category, rating: row.rating,
      reviewCount: Number(row.review_count), latitude: row.latitude, longitude: row.longitude, duration: row.duration,
      qualityScore: row.quality_score,
    } satisfies ExploreAttractionCandidate)),
  };
  if (timings) timings.candidateResultMappingMs = performance.now() - resultMappingStarted;
  return response;
}

export function exploreCategoryLabel(category: string) {
  const mapped = mapRawAttractionCategory(category);
  const labels: Record<InterestCategory, string> = {
    nature_scenic: "Nature & Scenic", outdoor_adventure: "Outdoor & Adventure",
    history_landmarks: "History & Landmarks", museums_culture: "Museums & Culture",
    food_drink: "Food & Drink", shopping: "Shopping",
  };
  return mapped ? labels[mapped] : category;
}
