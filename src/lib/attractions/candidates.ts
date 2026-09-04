import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "@/lib/db/postgres";
import type {
  AttractionCandidate,
  AttractionCandidatesResponse,
} from "@/types/attractions";

export const ATTRACTION_CANDIDATE_LIMIT = 500;

type CandidateQuery = {
  route: {
    type: "LineString";
    coordinates: [number, number][];
  };
  corridorMeters: number;
  limit?: number;
};

type CandidateRow = {
  id: string;
  name: string;
  category: string;
  rating: number;
  review_count: string;
  lat: number;
  lon: number;
  source_group: string | null;
  duration: string | null;
  distance_to_route_meters: number;
  total_count: string;
};

export class DatabaseConnectionError extends Error {
  constructor() {
    super("The attraction database could not be reached.");
    this.name = "DatabaseConnectionError";
  }
}

export class AttractionQueryError extends Error {
  constructor() {
    super("The attraction candidate query failed.");
    this.name = "AttractionQueryError";
  }
}

function toSafeInteger(value: string, field: string) {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${field} returned by the database.`);
  }

  return parsed;
}

function normalizeCandidate(row: CandidateRow): AttractionCandidate {
  return {
    id: toSafeInteger(row.id, "attraction id"),
    name: row.name,
    category: row.category,
    rating: row.rating,
    reviewCount: toSafeInteger(row.review_count, "review count"),
    lat: row.lat,
    lon: row.lon,
    sourceGroup: row.source_group,
    duration: row.duration,
    distanceToRouteMeters: row.distance_to_route_meters,
  };
}

export async function findAttractionCandidates({
  route,
  corridorMeters,
  limit = ATTRACTION_CANDIDATE_LIMIT,
}: CandidateQuery): Promise<AttractionCandidatesResponse> {
  const pool = getPostgresPool();
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch {
    throw new DatabaseConnectionError();
  }

  try {
    const result = await client.query<CandidateRow>(
      `
        WITH route AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography AS geom
        )
        SELECT
          attractions.id::text AS id,
          attractions.name,
          attractions.category,
          attractions.rating::double precision AS rating,
          attractions.review_count::text AS review_count,
          ST_Y(attractions.geom::geometry) AS lat,
          ST_X(attractions.geom::geometry) AS lon,
          attractions.source_group,
          attractions.duration,
          ST_Distance(attractions.geom, route.geom) AS distance_to_route_meters,
          count(*) OVER()::text AS total_count
        FROM public.attractions
        CROSS JOIN route
        WHERE attractions.geom IS NOT NULL
          AND attractions.name IS NOT NULL
          AND attractions.category IS NOT NULL
          AND attractions.rating IS NOT NULL
          AND attractions.review_count IS NOT NULL
          AND ST_DWithin(attractions.geom, route.geom, $2)
        ORDER BY distance_to_route_meters ASC, attractions.id ASC
        LIMIT $3
      `,
      [JSON.stringify(route), corridorMeters, limit]
    );

    const candidates = result.rows.map(normalizeCandidate);
    const totalCount = result.rows[0]
      ? toSafeInteger(result.rows[0].total_count, "candidate count")
      : 0;

    return {
      candidates,
      totalCount,
      truncated: totalCount > candidates.length,
    };
  } catch {
    throw new AttractionQueryError();
  } finally {
    client.release();
  }
}

export async function findDatasetMeanRating(): Promise<number> {
  const pool = getPostgresPool();
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch {
    throw new DatabaseConnectionError();
  }

  try {
    const result = await client.query<{ mean_rating: number | null }>(`
      SELECT avg(rating)::double precision AS mean_rating
      FROM public.attractions
      WHERE rating IS NOT NULL
    `);
    const mean = result.rows[0]?.mean_rating;
    if (typeof mean !== "number" || !Number.isFinite(mean)) throw new Error("Invalid dataset mean rating.");
    return mean;
  } catch {
    throw new AttractionQueryError();
  } finally {
    client.release();
  }
}
