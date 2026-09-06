import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "../db/postgres.ts";
import { INTEREST_CATEGORY_KEYS } from "../interests/taxonomy.ts";
import type { InterestCategory } from "../../types/preferences.ts";
import type { UserInterestProfile } from "../../types/user-interests.ts";

export async function loadUserInterestProfile(userId: string): Promise<UserInterestProfile> {
  const result = await getPostgresPool().query<{ category: InterestCategory; weight: number; source: "explicit" }>(
    "SELECT category,weight,source FROM public.user_interest_preferences WHERE user_id=$1 AND source='explicit'",
    [userId]
  );
  const order = new Map(INTEREST_CATEGORY_KEYS.map((category, index) => [category, index]));
  return { interests: result.rows.sort((a, b) => (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0)) };
}

async function insertExplicitInterests(client: PoolClient, userId: string, categories: InterestCategory[]) {
  for (const category of categories) {
    await client.query(
      "INSERT INTO public.user_interest_preferences (user_id,category,weight,source) VALUES ($1,$2,1.0,'explicit')",
      [userId, category]
    );
  }
}

export async function replaceUserInterestProfile(userId: string, categories: InterestCategory[]) {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM public.users WHERE id=$1 FOR UPDATE", [userId]);
    await client.query("DELETE FROM public.user_interest_preferences WHERE user_id=$1 AND source='explicit'", [userId]);
    await insertExplicitInterests(client, userId, categories);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return loadUserInterestProfile(userId);
}
