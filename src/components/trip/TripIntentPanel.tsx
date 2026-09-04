"use client";

import { FormEvent, useRef, useState } from "react";
import DraftSummary from "@/components/trip/DraftSummary";
import styles from "./TripIntentPanel.module.css";
import type {
  GeocodingResponse,
  GeocodingResult,
} from "@/types/geocoding";
import type { RouteResponse } from "@/types/route";
import type {
  Coordinates,
  DraftEndpoint,
  PlannerState,
  PickingMode,
  TripDraft,
  TripEndpoint,
  TripField,
} from "@/types/trip";

type TripIntentPanelProps = {
  origin: TripEndpoint;
  stop: TripEndpoint | null;
  destination: TripEndpoint;
  plannerState: PlannerState;
  pickingMode: PickingMode;
  onInputChange: (field: TripField, value: string) => void;
  onPickingModeChange: (mode: PickingMode) => void;
  onCoordinatesResolved: (
    field: TripField,
    coordinates: Coordinates,
    resolvedLabel: string
  ) => void;
  onAddStop: () => void;
  onRemoveStop: () => void;
  onGenerationStarted: () => void;
  onDraftBuilt: (draft: TripDraft) => void;
  onGenerationFailed: () => void;
};

class TripBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TripBuildError";
  }
}

async function geocodePlace(
  query: string,
  field: TripField
): Promise<GeocodingResult> {
  const response = await fetch("/api/geocode", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new TripBuildError(
      `Unable to geocode the ${field}. Please try again.`
    );
  }

  const data = (await response.json()) as GeocodingResponse;
  const result = data.results[0];

  if (!result) {
    throw new TripBuildError(
      `No location was found for the ${field}. Check the place and try again.`
    );
  }

  return result;
}

async function resolveEndpoint(
  endpoint: TripEndpoint,
  field: TripField,
  onCoordinatesResolved: TripIntentPanelProps["onCoordinatesResolved"]
): Promise<DraftEndpoint> {
  if (endpoint.coordinates) {
    return {
      label: endpoint.resolvedLabel ?? endpoint.input,
      coordinates: endpoint.coordinates,
    };
  }

  const result = await geocodePlace(endpoint.input.trim(), field);
  const coordinates = { lat: result.lat, lon: result.lon };
  onCoordinatesResolved(field, coordinates, result.label);
  return { label: result.label, coordinates };
}

export default function TripIntentPanel({
  origin,
  stop,
  destination,
  plannerState,
  pickingMode,
  onInputChange,
  onPickingModeChange,
  onCoordinatesResolved,
  onAddStop,
  onRemoveStop,
  onGenerationStarted,
  onDraftBuilt,
  onGenerationFailed,
}: TripIntentPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const isGenerating = plannerState.status === "generating_draft";
  const visibleDraft =
    plannerState.status === "draft_ready"
      ? plannerState.draft
      : plannerState.status === "generating_draft"
        ? plannerState.previousDraft
        : null;
  const visibleDraftIsDirty =
    plannerState.status === "draft_ready"
      ? plannerState.isDirty
      : plannerState.status === "generating_draft"
        ? plannerState.previousIsDirty
        : false;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isGenerating || requestInFlight.current) {
      return;
    }

    setError(null);

    if (
      !origin.input.trim() ||
      (stop && !stop.input.trim()) ||
      !destination.input.trim()
    ) {
      setError("Enter or select every trip location.");
      return;
    }

    requestInFlight.current = true;
    onGenerationStarted();

    try {
      const resolvedOrigin = await resolveEndpoint(
        origin,
        "origin",
        onCoordinatesResolved
      );
      const resolvedStop = stop
        ? await resolveEndpoint(stop, "stop", onCoordinatesResolved)
        : null;
      const resolvedDestination = await resolveEndpoint(
        destination,
        "destination",
        onCoordinatesResolved
      );

      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations: [
            resolvedOrigin.coordinates,
            ...(resolvedStop ? [resolvedStop.coordinates] : []),
            resolvedDestination.coordinates,
          ],
        }),
      });

      if (!response.ok) {
        throw new TripBuildError(
          "The endpoints are set, but routing failed. Please try again."
        );
      }

      const data = (await response.json()) as RouteResponse;
      onDraftBuilt({
        origin: resolvedOrigin,
        stop: resolvedStop,
        destination: resolvedDestination,
        route: data.route,
        summary: data.summary,
      });
    } catch (reason) {
      onGenerationFailed();
      console.error("Failed to build route:", reason);
      setError(
        reason instanceof TripBuildError
          ? reason.message
          : "Unable to build the route. Please try again."
      );
    } finally {
      requestInFlight.current = false;
    }
  }

  function togglePickingMode(field: TripField) {
    onPickingModeChange(pickingMode === field ? null : field);
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-intent-heading">
      <h1 id="trip-intent-heading">Trip intent</h1>
      <form onSubmit={handleSubmit}>
        <div className={styles.endpointField}>
          <label className={styles.placeField}>
            Origin
            <input
              name="origin"
              value={origin.input}
              disabled={isGenerating}
              onChange={(event) =>
                onInputChange("origin", event.target.value)
              }
            />
          </label>
          <button
            className={styles.pickButton}
            type="button"
            disabled={isGenerating}
            aria-pressed={pickingMode === "origin"}
            onClick={() => togglePickingMode("origin")}
          >
            {pickingMode === "origin"
              ? "Click map for start"
              : "Pick start on map"}
          </button>
        </div>

        {stop ? (
          <div className={styles.endpointField}>
            <label className={styles.placeField}>
              Stop
              <input
                name="stop"
                value={stop.input}
                disabled={isGenerating}
                onChange={(event) =>
                  onInputChange("stop", event.target.value)
                }
              />
            </label>
            <div className={styles.stopActions}>
              <button
                className={styles.pickButton}
                type="button"
                disabled={isGenerating}
                aria-pressed={pickingMode === "stop"}
                onClick={() => togglePickingMode("stop")}
              >
                {pickingMode === "stop"
                  ? "Click map for stop"
                  : "Pick stop on map"}
              </button>
              <button
                className={styles.removeButton}
                type="button"
                disabled={isGenerating}
                onClick={onRemoveStop}
              >
                Remove stop
              </button>
            </div>
          </div>
        ) : (
          <button
            className={styles.addButton}
            type="button"
            disabled={isGenerating}
            onClick={onAddStop}
          >
            Add stop
          </button>
        )}

        <div className={styles.endpointField}>
          <label className={styles.placeField}>
            Destination
            <input
              name="destination"
              value={destination.input}
              disabled={isGenerating}
              onChange={(event) =>
                onInputChange("destination", event.target.value)
              }
            />
          </label>
          <button
            className={styles.pickButton}
            type="button"
            disabled={isGenerating}
            aria-pressed={pickingMode === "destination"}
            onClick={() => togglePickingMode("destination")}
          >
            {pickingMode === "destination"
              ? "Click map for destination"
              : "Pick destination on map"}
          </button>
        </div>

        <button type="submit" disabled={isGenerating || pickingMode !== null}>
          {isGenerating ? "Building route…" : "Build route"}
        </button>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {visibleDraft ? (
        <DraftSummary draft={visibleDraft} isDirty={visibleDraftIsDirty} />
      ) : null}
    </section>
  );
}
