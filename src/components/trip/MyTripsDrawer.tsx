"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TripListItem } from "@/types/trip-persistence";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function statusLabel(status: TripListItem["status"]) {
  if (status === "completed_unconfirmed") return "Completed";
  if (status === "not_traveled") return "Not traveled";
  return status[0].toUpperCase() + status.slice(1);
}

export default function MyTripsDrawer({ open, currentTripId, hasClientOnlyChanges, newTripDisabled, onClose, onNewTrip }: { open: boolean; currentTripId: string | null; hasClientOnlyChanges: boolean; newTripDisabled: boolean; onClose: () => void; onNewTrip: () => void }) {
  const router = useRouter();
  const [trips, setTrips] = useState<TripListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [isConfirmingNewTrip, setIsConfirmingNewTrip] = useState(false);
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
    <header><h2>My Trips</h2><div><button disabled={newTripDisabled} onClick={() => { if (hasClientOnlyChanges) setIsConfirmingNewTrip(true); else onNewTrip(); }}>New trip</button><button onClick={onClose} aria-label="Close My Trips">Close</button></div></header>
    {isConfirmingNewTrip ? <div className="new-trip-confirmation" role="dialog" aria-label="Start a new trip?">
      <strong>Start a new trip?</strong>
      <p>Changes that haven&apos;t been rebuilt will be discarded.</p>
      <div><button onClick={() => setIsConfirmingNewTrip(false)}>Cancel</button><button onClick={onNewTrip}>New trip</button></div>
    </div> : null}
    {error ? <p role="alert">Saved trips could not be loaded.</p> : trips === null ? <p>Loading trips…</p> : trips.length === 0 ? <div><p>No saved trips yet.</p><p>Plan a trip and save it to your map.</p></div> :
      <ul>{trips.map((trip) => <li key={trip.id} className={trip.id === currentTripId ? "current" : undefined}>
        <button onClick={() => { onClose(); router.push(`/?trip=${trip.id}`); }}>
          <strong>{trip.originLabel ?? "Unknown origin"} → {trip.destinationLabel ?? "Unknown destination"}</strong>
          <span>{statusLabel(trip.status)} · {trip.preferences?.selectedTripDays ?? 1} day{(trip.preferences?.selectedTripDays ?? 1) === 1 ? "" : "s"} · {trip.attractionStopCount} attraction{trip.attractionStopCount === 1 ? "" : "s"}</span>
          <small>Updated {dateLabel(trip.updatedAt)}{trip.id === currentTripId ? " · Open" : ""}</small>
        </button>
      </li>)}</ul>}
  </aside>;
}
