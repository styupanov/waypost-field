import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "../db/postgres.ts";

export class TripCreditError extends Error {
  readonly code: "TRIP_CREDIT_REQUIRED";
  constructor(code: "TRIP_CREDIT_REQUIRED", message: string) { super(message); this.name = "TripCreditError"; this.code = code; }
}

export async function ensureTripCreditAccountWithClient(client: PoolClient, userId: string) {
  await client.query("INSERT INTO public.trip_credit_accounts (user_id,balance) VALUES ($1,0) ON CONFLICT (user_id) DO NOTHING", [userId]);
  const inserted = await client.query("INSERT INTO public.trip_credit_ledger (user_id,amount,entry_type,idempotency_key) VALUES ($1,1,'welcome_grant',$2) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id", [userId, `welcome:${userId}`]);
  if (inserted.rowCount) await client.query("UPDATE public.trip_credit_accounts SET balance=balance+1,updated_at=now() WHERE user_id=$1", [userId]);
}

export async function ensureTripCreditAccount(userId: string) {
  const client = await getPostgresPool().connect();
  try { await client.query("BEGIN"); await ensureTripCreditAccountWithClient(client, userId); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function getTripCreditBalance(userId: string) {
  await ensureTripCreditAccount(userId);
  const result = await getPostgresPool().query<{ balance: number }>("SELECT balance FROM public.trip_credit_accounts WHERE user_id=$1", [userId]);
  return result.rows[0]?.balance ?? 0;
}

export async function assertTripCreditAvailable(userId: string) {
  if (await getTripCreditBalance(userId) < 1) throw new TripCreditError("TRIP_CREDIT_REQUIRED", "You need 1 Trip Credit to finalize this trip.");
}

export async function consumeFinalizationCredit(client: PoolClient, userId: string, tripVersionId: string) {
  await ensureTripCreditAccountWithClient(client, userId);
  const account = await client.query<{ balance: number }>("SELECT balance FROM public.trip_credit_accounts WHERE user_id=$1 FOR UPDATE", [userId]);
  if (!account.rowCount || account.rows[0].balance < 1) throw new TripCreditError("TRIP_CREDIT_REQUIRED", "You need 1 Trip Credit to finalize this trip.");
  const ledger = await client.query("INSERT INTO public.trip_credit_ledger (user_id,amount,entry_type,trip_version_id,idempotency_key) VALUES ($1,-1,'trip_finalization',$2,$3) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id", [userId, tripVersionId, `finalize:${tripVersionId}`]);
  if (!ledger.rowCount) return;
  const updated = await client.query("UPDATE public.trip_credit_accounts SET balance=balance-1,updated_at=now() WHERE user_id=$1 AND balance>=1", [userId]);
  if (!updated.rowCount) throw new TripCreditError("TRIP_CREDIT_REQUIRED", "You need 1 Trip Credit to finalize this trip.");
}
