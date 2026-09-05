import "server-only";
import { getPostgresPool } from "../db/postgres.ts";
import type { ExecutableTripStatus } from "../../types/final-route.ts";

export class TripLifecycleError extends Error {
  readonly code: "TRIP_NOT_FOUND" | "TRIP_NOT_READY_TO_START" | "TRIP_NOT_ACTIVE" | "TRIP_LIFECYCLE_CONFLICT" | "TRIP_NOT_AWAITING_CONFIRMATION" | "TRAVEL_CONFIRMATION_CONFLICT";

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
  travelConfirmationAt: string | null;
};

type LockedTrip = {
  id: string;
  user_id: string;
  status: "draft" | ExecutableTripStatus;
  current_version_id: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  travel_confirmation_at: Date | null;
  version_state: "draft" | "finalized" | null;
};

async function transition(userId: string, tripId: string, action: "start" | "complete"): Promise<TripLifecycleResult> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<LockedTrip>(
      `SELECT t.id,t.user_id,t.status,t.current_version_id,t.started_at,t.ended_at,t.travel_confirmation_at,v.state AS version_state
       FROM public.trips t LEFT JOIN public.trip_versions v ON v.id=t.current_version_id
       WHERE t.id=$1 FOR UPDATE OF t`,
      [tripId]
    );
    const trip = result.rows[0];
    if (!trip || trip.user_id !== userId) throw new TripLifecycleError("TRIP_NOT_FOUND", "Trip was not found.");

    if (action === "start" && trip.status === "active" && trip.started_at && !trip.ended_at) {
      await client.query("COMMIT");
      return { tripId, status: "active", startedAt: trip.started_at.toISOString(), endedAt: null, travelConfirmationAt: null };
    }
    if (action === "complete" && trip.status === "completed_unconfirmed" && trip.started_at && trip.ended_at) {
      await client.query("COMMIT");
      return { tripId, status: "completed_unconfirmed", startedAt: trip.started_at.toISOString(), endedAt: trip.ended_at.toISOString(), travelConfirmationAt: null };
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
    return { tripId, status: row.status, startedAt: row.started_at.toISOString(), endedAt: row.ended_at?.toISOString() ?? null, travelConfirmationAt: null };
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

export type TravelConfirmationOutcome = "traveled" | "not_traveled";

export function isTripEligibleForTravelCoverage(status: LockedTrip["status"]) {
  return status === "traveled";
}

async function travelConfirmationTransaction(userId: string, tripId: string, outcome: TravelConfirmationOutcome | "undo"): Promise<TripLifecycleResult> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<LockedTrip>(
      `SELECT t.id,t.user_id,t.status,t.current_version_id,t.started_at,t.ended_at,t.travel_confirmation_at,v.state AS version_state
       FROM public.trips t LEFT JOIN public.trip_versions v ON v.id=t.current_version_id
       WHERE t.id=$1 FOR UPDATE OF t`,
      [tripId]
    );
    const trip = result.rows[0];
    if (!trip || trip.user_id !== userId) throw new TripLifecycleError("TRIP_NOT_FOUND", "Trip was not found.");

    if (outcome === "undo" && trip.status === "completed_unconfirmed" && !trip.travel_confirmation_at) {
      await client.query("COMMIT");
      return { tripId, status: "completed_unconfirmed", startedAt: trip.started_at!.toISOString(), endedAt: trip.ended_at!.toISOString(), travelConfirmationAt: null };
    }
    if (outcome !== "undo" && trip.status === outcome && trip.travel_confirmation_at) {
      await client.query("COMMIT");
      return { tripId, status: outcome, startedAt: trip.started_at!.toISOString(), endedAt: trip.ended_at!.toISOString(), travelConfirmationAt: trip.travel_confirmation_at.toISOString() };
    }
    if (outcome !== "undo" && (trip.status === "traveled" || trip.status === "not_traveled")) {
      throw new TripLifecycleError("TRAVEL_CONFIRMATION_CONFLICT", "Undo the existing travel confirmation before choosing a different outcome.");
    }
    if (outcome === "undo" && trip.status !== "traveled" && trip.status !== "not_traveled") {
      throw new TripLifecycleError("TRIP_NOT_AWAITING_CONFIRMATION", "This trip does not have a travel confirmation to undo.");
    }
    if (outcome !== "undo" && trip.status !== "completed_unconfirmed") {
      throw new TripLifecycleError("TRIP_NOT_AWAITING_CONFIRMATION", "This trip is not waiting for travel confirmation.");
    }
    if (trip.version_state !== "finalized" || !trip.current_version_id || !trip.started_at || !trip.ended_at) {
      throw new TripLifecycleError("TRIP_LIFECYCLE_CONFLICT", "The completed trip does not have a finalized version.");
    }

    const updated = await client.query<{ status: ExecutableTripStatus; started_at: Date; ended_at: Date; travel_confirmation_at: Date | null }>(
      outcome === "undo"
        ? "UPDATE public.trips SET status='completed_unconfirmed',travel_confirmation_at=NULL,updated_at=now() WHERE id=$1 RETURNING status,started_at,ended_at,travel_confirmation_at"
        : "UPDATE public.trips SET status=$2,travel_confirmation_at=now(),updated_at=now() WHERE id=$1 RETURNING status,started_at,ended_at,travel_confirmation_at",
      outcome === "undo" ? [tripId] : [tripId, outcome]
    );
    if (outcome === "undo") {
      await client.query("DELETE FROM public.trip_poi_visit_confirmations WHERE user_id=$1 AND trip_version_id=$2", [userId, trip.current_version_id]);
    }
    await client.query("COMMIT");
    const row = updated.rows[0];
    return { tripId, status: row.status, startedAt: row.started_at.toISOString(), endedAt: row.ended_at.toISOString(), travelConfirmationAt: row.travel_confirmation_at?.toISOString() ?? null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function confirmTripTravelOutcome(userId: string, tripId: string, outcome: TravelConfirmationOutcome) {
  return travelConfirmationTransaction(userId, tripId, outcome);
}

export function undoTripTravelConfirmation(userId: string, tripId: string) {
  return travelConfirmationTransaction(userId, tripId, "undo");
}
