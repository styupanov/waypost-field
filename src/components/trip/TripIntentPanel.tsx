"use client";

import { FormEvent, useState } from "react";
import styles from "./TripIntentPanel.module.css";
import type {
  GeocodingResponse,
  GeocodingResult,
} from "@/types/geocoding";
import type { RouteFeature } from "@/types/route";
import type {
  Coordinates,
  PickingMode,
  TripEndpoint,
  TripField,
} from "@/types/trip";

type TripIntentPanelProps = {
  origin: TripEndpoint;
  destination: TripEndpoint;
  pickingMode: PickingMode;
  onInputChange: (field: TripField, value: string) => void;
  onPickingModeChange: (mode: PickingMode) => void;
  onCoordinatesResolved: (
    field: TripField,
    coordinates: Coordinates
  ) => void;
  onRouteBuilt: (route: RouteFeature) => void;
};

type RouteResponse = {
  route: RouteFeature;
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
): Promise<Coordinates> {
  if (endpoint.coordinates) {
    return endpoint.coordinates;
  }

  const result = await geocodePlace(endpoint.input.trim(), field);
  const coordinates = { lat: result.lat, lon: result.lon };
  onCoordinatesResolved(field, coordinates);
  return coordinates;
}

export default function TripIntentPanel({
  origin,
  destination,
  pickingMode,
  onInputChange,
  onPickingModeChange,
  onCoordinatesResolved,
  onRouteBuilt,
}: TripIntentPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!origin.input.trim() || !destination.input.trim()) {
      setError("Enter or select both an origin and a destination.");
      return;
    }

    setIsLoading(true);

    try {
      const originCoordinates = await resolveEndpoint(
        origin,
        "origin",
        onCoordinatesResolved
      );
      const destinationCoordinates = await resolveEndpoint(
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
          locations: [originCoordinates, destinationCoordinates],
        }),
      });

      if (!response.ok) {
        throw new TripBuildError(
          "The endpoints are set, but routing failed. Please try again."
        );
      }

      const data = (await response.json()) as RouteResponse;
      onRouteBuilt(data.route);
    } catch (reason) {
      console.error("Failed to build route:", reason);
      setError(
        reason instanceof TripBuildError
          ? reason.message
          : "Unable to build the route. Please try again."
      );
    } finally {
      setIsLoading(false);
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
              disabled={isLoading}
              onChange={(event) =>
                onInputChange("origin", event.target.value)
              }
            />
          </label>
          <button
            className={styles.pickButton}
            type="button"
            disabled={isLoading}
            aria-pressed={pickingMode === "origin"}
            onClick={() => togglePickingMode("origin")}
          >
            {pickingMode === "origin"
              ? "Click map for start"
              : "Pick start on map"}
          </button>
        </div>

        <div className={styles.endpointField}>
          <label className={styles.placeField}>
            Destination
            <input
              name="destination"
              value={destination.input}
              disabled={isLoading}
              onChange={(event) =>
                onInputChange("destination", event.target.value)
              }
            />
          </label>
          <button
            className={styles.pickButton}
            type="button"
            disabled={isLoading}
            aria-pressed={pickingMode === "destination"}
            onClick={() => togglePickingMode("destination")}
          >
            {pickingMode === "destination"
              ? "Click map for destination"
              : "Pick destination on map"}
          </button>
        </div>

        <button type="submit" disabled={isLoading || pickingMode !== null}>
          {isLoading ? "Building route…" : "Build route"}
        </button>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
