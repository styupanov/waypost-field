import "server-only";
import { getPostgresPool } from "../db/postgres.ts";

export type AuthenticatedIdentity = {
  subject: string;
  email?: string;
  name?: string;
};

export async function resolveWaypostUserId(authSubject: string) {
  const result = await getPostgresPool().query<{ id: string }>(
    `INSERT INTO public.users (auth_subject)
     VALUES ($1)
     ON CONFLICT (auth_subject) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [authSubject]
  );
  return result.rows[0].id;
}
