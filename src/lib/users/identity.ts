import "server-only";
import { getPostgresPool } from "../db/postgres.ts";
import { ensureTripCreditAccountWithClient } from "../credits/repository.ts";

export type AuthenticatedIdentity = {
  subject: string;
  email?: string;
  name?: string;
};

export async function resolveWaypostUserId(authSubject: string) {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(`INSERT INTO public.users (auth_subject) VALUES ($1) ON CONFLICT (auth_subject) DO UPDATE SET updated_at=now() RETURNING id`, [authSubject]);
    await ensureTripCreditAccountWithClient(client, result.rows[0].id);
    await client.query("COMMIT");
    return result.rows[0].id;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
