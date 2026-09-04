"use client";

import { FormEvent, useState } from "react";
import styles from "./TripIntentPanel.module.css";
import type {
  GeocodingResponse,
  GeocodingResult,
} from "@/types/geocoding";
import type { RouteFeature } from "@/types/route";

type TripIntentPanelProps = {
  onRouteBuilt: (route: RouteFeature) => void;
};

type RouteResponse = {
  route: RouteFeature;
};

type TripField = "origin" | "destination";

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

export default function TripIntentPanel({
  onRouteBuilt,
}: TripIntentPanelProps) {
  const [origin, setOrigin] = useState("Charlotte, NC");
  const [destination, setDestination] = useState("Denver, CO");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedOrigin = origin.trim();
    const trimmedDestination = destination.trim();

    if (!trimmedOrigin || !trimmedDestination) {
      setError("Enter both an origin and a destination.");
      return;
    }

    setIsLoading(true);

    try {
      const originResult = await geocodePlace(trimmedOrigin, "origin");
      const destinationResult = await geocodePlace(
        trimmedDestination,
        "destination"
      );

      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations: [
            { lat: originResult.lat, lon: originResult.lon },
            { lat: destinationResult.lat, lon: destinationResult.lon },
          ],
        }),
      });

      if (!response.ok) {
        throw new TripBuildError(
          "The places were found, but routing failed. Please try again."
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

  return (
    <section className={styles.panel} aria-labelledby="trip-intent-heading">
      <h1 id="trip-intent-heading">Trip intent</h1>
      <form onSubmit={handleSubmit}>
        <label className={styles.placeField}>
          Origin
          <input
            name="origin"
            value={origin}
            disabled={isLoading}
            onChange={(event) => setOrigin(event.target.value)}
          />
        </label>

        <label className={styles.placeField}>
          Destination
          <input
            name="destination"
            value={destination}
            disabled={isLoading}
            onChange={(event) => setDestination(event.target.value)}
          />
        </label>

        <button type="submit" disabled={isLoading}>
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
