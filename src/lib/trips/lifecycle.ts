import "server-only";
import { getPostgresPool } from "../db/postgres.ts";
import type { ExecutableTripStatus } from "../../types/final-route.ts";

export class TripLifecycleError extends Error {
  readonly code: "TRIP_NOT_FOUND" | "TRIP_NOT_READY_TO_START" | "TRIP_NOT_ACTIVE" | "TRIP_LIFECYCLE_CONFLICT";

  constructor(code: TripLifecycleError["code"], message: string) {
    super(message);
    this.name = "TripLifecycleError";
    this.code = code;
  }
}

export type TripLifecycleResult = {
  tripId: string;
  status: ExecutableTripStatus;
  startedAt: string | null;
  endedAt: string | null;
};

type LockedTrip = {
  id: string;
  user_id: string;
  status: "draft" | ExecutableTripStatus;
  current_version_id: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  version_state: "draft" | "finalized" | null;
};

async function transition(userId: string, tripId: string, action: "start" | "complete"): Promise<TripLifecycleResult> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<LockedTrip>(
      `SELECT t.id,t.user_id,t.status,t.current_version_id,t.started_at,t.ended_at,v.state AS version_state
       FROM public.trips t LEFT JOIN public.trip_versions v ON v.id=t.current_version_id
       WHERE t.id=$1 FOR UPDATE OF t`,
      [tripId]
    );
    const trip = result.rows[0];
    if (!trip || trip.user_id !== userId) throw new TripLifecycleError("TRIP_NOT_FOUND", "Trip was not found.");

    if (action === "start" && trip.status === "active" && trip.started_at && !trip.ended_at) {
      await client.query("COMMIT");
      return { tripId, status: "active", startedAt: trip.started_at.toISOString(), endedAt: null };
    }
    if (action === "complete" && trip.status === "completed_unconfirmed" && trip.started_at && trip.ended_at) {
      await client.query("COMMIT");
      return { tripId, status: "completed_unconfirmed", startedAt: trip.started_at.toISOString(), endedAt: trip.ended_at.toISOString() };
    }
    if (action === "start" && trip.status !== "planned") {
      throw new TripLifecycleError("TRIP_NOT_READY_TO_START", "Trip is not ready to start.");
    }
    if (action === "complete" && trip.status !== "active") {
      throw new TripLifecycleError("TRIP_NOT_ACTIVE", "Trip is not active.");
    }
    if (trip.version_state !== "finalized" || !trip.current_version_id) {
      throw new TripLifecycleError("TRIP_LIFECYCLE_CONFLICT", "The current trip version is not finalized.");
    }

    const updated = await client.query<{ status: ExecutableTripStatus; started_at: Date; ended_at: Date | null }>(
      action === "start"
        ? "UPDATE public.trips SET status='active',started_at=now(),ended_at=NULL,updated_at=now() WHERE id=$1 RETURNING status,started_at,ended_at"
        : "UPDATE public.trips SET status='completed_unconfirmed',ended_at=now(),updated_at=now() WHERE id=$1 RETURNING status,started_at,ended_at",
      [tripId]
    );
    await client.query("COMMIT");
    const row = updated.rows[0];
    return { tripId, status: row.status, startedAt: row.started_at.toISOString(), endedAt: row.ended_at?.toISOString() ?? null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function startTrip(userId: string, tripId: string) {
  return transition(userId, tripId, "start");
}

export function completeTrip(userId: string, tripId: string) {
  return transition(userId, tripId, "complete");
}
