import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { INTEREST_CATEGORIES, INTEREST_CATEGORY_KEYS } from "../src/lib/interests/taxonomy.ts";
import { parseUserInterestUpdate } from "../src/lib/user-interests/validation.ts";
import { getUserInterestsResponse, putUserInterestsResponse } from "../src/lib/user-interests/responses.ts";

const pool = getPostgresPool();
const userA = randomUUID(); const userB = randomUUID();
const jsonRequest = (body: unknown) => new Request("http://local/api/me/interests", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const invariants = () => pool.query(`SELECT
  (SELECT count(*)::int FROM route_coverage) coverage,
  (SELECT count(*)::int FROM trip_credit_ledger) credits,
  (SELECT COALESCE(sum(balance),0)::int FROM trip_credit_accounts) balances,
  (SELECT count(*)::int FROM trip_poi_visit_confirmations) confirmations,
  (SELECT md5(COALESCE(string_agg(id::text || ':' || preferences::text, ',' ORDER BY id),'')) FROM trip_versions) trip_preferences,
  (SELECT md5(COALESCE(string_agg(id::text || ':' || status, ',' ORDER BY id),'')) FROM trips) lifecycle`);

try {
  const before = (await invariants()).rows[0];
  assert.equal(new Set(INTEREST_CATEGORY_KEYS).size, INTEREST_CATEGORY_KEYS.length);
  assert.deepEqual(INTEREST_CATEGORIES.map(({ key }) => key), INTEREST_CATEGORY_KEYS);
  assert.deepEqual(parseUserInterestUpdate({ selectedCategories: [] }), []);
  assert.deepEqual(parseUserInterestUpdate({ selectedCategories: ["nature_scenic"] }), ["nature_scenic"]);
  assert.equal(parseUserInterestUpdate({ selectedCategories: ["unknown"] }), null);
  assert.equal(parseUserInterestUpdate({ selectedCategories: ["shopping", "shopping"] }), null);
  assert.equal(parseUserInterestUpdate({ selectedCategories: [], user_id: userB }), null);
  assert.equal(parseUserInterestUpdate({ selectedCategories: [], weight: 0.5 }), null);

  await pool.query("INSERT INTO public.users (id,auth_subject) VALUES ($1,$2),($3,$4)", [userA, `interests-a-${userA}`, userB, `interests-b-${userB}`]);
  assert.equal((await getUserInterestsResponse(null)).status, 401);
  assert.deepEqual(await (await getUserInterestsResponse(userA)).json(), { selectedCategories: [] });
  assert.equal((await putUserInterestsResponse(userA, jsonRequest({ selectedCategories: ["unknown"] }))).status, 400);
  assert.equal((await putUserInterestsResponse(userA, jsonRequest({ selectedCategories: ["shopping", "shopping"] }))).status, 400);
  assert.equal((await putUserInterestsResponse(userA, jsonRequest({ selectedCategories: ["shopping"], user_id: userB }))).status, 400);
  assert.equal((await putUserInterestsResponse(userA, jsonRequest({ selectedCategories: ["shopping"], weight: 0.2 }))).status, 400);

  const created = await putUserInterestsResponse(userA, jsonRequest({ selectedCategories: ["nature_scenic", "history_landmarks"] }));
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), { selectedCategories: ["nature_scenic", "history_landmarks"] });
  const rowsA = (await pool.query("SELECT category,weight,source FROM public.user_interest_preferences WHERE user_id=$1 ORDER BY category", [userA])).rows;
  assert.equal(rowsA.length, 2); assert.ok(rowsA.every((row) => row.weight === 1 && row.source === "explicit"));

  await putUserInterestsResponse(userB, jsonRequest({ selectedCategories: ["shopping"] }));
  assert.deepEqual(await (await getUserInterestsResponse(userA)).json(), { selectedCategories: ["nature_scenic", "history_landmarks"] });
  assert.deepEqual(await (await getUserInterestsResponse(userB)).json(), { selectedCategories: ["shopping"] });
  assert.deepEqual(await (await putUserInterestsResponse(userA, jsonRequest({ selectedCategories: ["food_drink"] }))).json(), { selectedCategories: ["food_drink"] });
  assert.equal((await pool.query("SELECT count(*)::int count FROM public.user_interest_preferences WHERE user_id=$1", [userA])).rows[0].count, 1);
  assert.deepEqual(await (await getUserInterestsResponse(userA)).json(), { selectedCategories: ["food_drink"] });

  const version = (await pool.query<{ id: string; preferences: unknown }>("SELECT id,preferences FROM public.trip_versions ORDER BY id LIMIT 1")).rows[0];
  assert.ok(version, "A persisted TripVersion is required for the isolation regression.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE public.trip_versions SET preferences=$2::jsonb WHERE id=$1", [version.id, JSON.stringify({ ...version.preferences as object, preferredCategories: ["shopping"] })]);
    assert.deepEqual((await client.query("SELECT category FROM public.user_interest_preferences WHERE user_id=$1 ORDER BY category", [userA])).rows.map((row) => row.category), ["food_drink"]);
    await client.query("ROLLBACK");
  } finally { client.release(); }

  assert.deepEqual(await (await putUserInterestsResponse(userA, jsonRequest({ selectedCategories: [] }))).json(), { selectedCategories: [] });
  assert.deepEqual(await (await getUserInterestsResponse(userA)).json(), { selectedCategories: [] });

  const columns = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_interest_preferences' ORDER BY ordinal_position")).rows.map((row) => row.column_name);
  assert.deepEqual(columns, ["user_id", "category", "weight", "source", "created_at", "updated_at"]);
  const constraints = (await pool.query("SELECT contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.user_interest_preferences'::regclass")).rows;
  assert.ok(constraints.some((row) => row.contype === "p" && row.definition.includes("user_id, category")));
  assert.ok(constraints.some((row) => row.contype === "f" && row.definition.includes("users(id)") && row.definition.includes("ON DELETE CASCADE")));
  assert.ok(constraints.some((row) => row.contype === "c" && row.definition.includes("weight >") && row.definition.includes("weight <=")));

  await pool.query("DELETE FROM public.users WHERE id=ANY($1::uuid[])", [[userA, userB]]);
  const after = (await invariants()).rows[0];
  assert.deepEqual(after, before);
  console.log("User interest taxonomy, validation, persistence, replacement, ownership, schema, and Trip isolation checks passed.");
} finally {
  await pool.query("DELETE FROM public.user_interest_preferences WHERE user_id=ANY($1::uuid[])", [[userA, userB]]).catch(() => undefined);
  await pool.query("DELETE FROM public.users WHERE id=ANY($1::uuid[])", [[userA, userB]]).catch(() => undefined);
  await pool.end();
}
