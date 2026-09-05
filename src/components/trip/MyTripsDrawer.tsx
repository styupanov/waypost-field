"use client";

import { useEffect, useState } from "react";
import type { TripListItem } from "@/types/trip-persistence";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function statusLabel(status: TripListItem["status"]) {
  if (status === "completed_unconfirmed") return "Completed";
  if (status === "not_traveled") return "Not traveled";
  return status[0].toUpperCase() + status.slice(1);
}

export default function MyTripsDrawer({ open, currentTripId, newTripDisabled, onClose, onNewTrip, onTripSelect }: { open: boolean; currentTripId: string | null; newTripDisabled: boolean; onClose: () => void; onNewTrip: () => void; onTripSelect: (tripId: string) => void }) {
  const [trips, setTrips] = useState<TripListItem[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/trips").then(async (response) => {
      if (!response.ok) throw new Error("list failed");
      const data = await response.json() as { trips: TripListItem[] };
      if (!cancelled) { setTrips(data.trips); setError(false); }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [open]);
  if (!open) return null;
  return <aside className="my-trips-drawer" aria-label="My Trips">
    <header><h2>My Trips</h2><div><button disabled={newTripDisabled} onClick={onNewTrip}>New trip</button><button onClick={onClose} aria-label="Close My Trips">Close</button></div></header>
    {error ? <p role="alert">Saved trips could not be loaded.</p> : trips === null ? <p>Loading trips…</p> : trips.length === 0 ? <div><p>No saved trips yet.</p><p>Plan a trip and save it to your map.</p></div> :
      <ul>{trips.map((trip) => <li key={trip.id} className={trip.id === currentTripId ? "current" : undefined}>
        <button onClick={() => onTripSelect(trip.id)}>
          <strong>{trip.originLabel ?? "Unknown origin"} → {trip.destinationLabel ?? "Unknown destination"}</strong>
          <span>{statusLabel(trip.status)} · {trip.preferences?.selectedTripDays ?? 1} day{(trip.preferences?.selectedTripDays ?? 1) === 1 ? "" : "s"} · {trip.attractionStopCount} attraction{trip.attractionStopCount === 1 ? "" : "s"}</span>
          <small>Updated {dateLabel(trip.updatedAt)}{trip.id === currentTripId ? " · Open" : ""}</small>
        </button>
      </li>)}</ul>}
  </aside>;
}
