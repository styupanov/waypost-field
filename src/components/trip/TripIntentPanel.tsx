"use client";

import { FormEvent, useState } from "react";
import styles from "./TripIntentPanel.module.css";
import type { RouteFeature } from "@/types/route";

type TripIntentPanelProps = {
  onRouteBuilt: (route: RouteFeature) => void;
};

type RouteResponse = {
  route: RouteFeature;
};

const initialCoordinates = {
  originLat: "35.2271",
  originLon: "-80.8431",
  destinationLat: "39.7392",
  destinationLon: "-104.9903",
};

export default function TripIntentPanel({
  onRouteBuilt,
}: TripIntentPanelProps) {
  const [coordinates, setCoordinates] = useState(initialCoordinates);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateCoordinate(name: keyof typeof coordinates, value: string) {
    setCoordinates((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const values = Object.values(coordinates).map((value) =>
      value.trim() === "" ? Number.NaN : Number(value)
    );

    if (!values.every(Number.isFinite)) {
      setError("Enter a valid number for all four coordinates.");
      return;
    }

    const [originLat, originLon, destinationLat, destinationLon] = values;
    setIsLoading(true);

    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations: [
            { lat: originLat, lon: originLon },
            { lat: destinationLat, lon: destinationLon },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Routing request failed with status ${response.status}.`);
      }

      const data = (await response.json()) as RouteResponse;
      onRouteBuilt(data.route);
    } catch (reason) {
      console.error("Failed to build route:", reason);
      setError("Unable to build the route. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-intent-heading">
      <h1 id="trip-intent-heading">Trip intent</h1>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={isLoading}>
          <legend>Origin</legend>
          <div className={styles.coordinateGrid}>
            <label>
              Latitude
              <input
                name="originLat"
                inputMode="decimal"
                value={coordinates.originLat}
                onChange={(event) =>
                  updateCoordinate("originLat", event.target.value)
                }
              />
            </label>
            <label>
              Longitude
              <input
                name="originLon"
                inputMode="decimal"
                value={coordinates.originLon}
                onChange={(event) =>
                  updateCoordinate("originLon", event.target.value)
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset disabled={isLoading}>
          <legend>Destination</legend>
          <div className={styles.coordinateGrid}>
            <label>
              Latitude
              <input
                name="destinationLat"
                inputMode="decimal"
                value={coordinates.destinationLat}
                onChange={(event) =>
                  updateCoordinate("destinationLat", event.target.value)
                }
              />
            </label>
            <label>
              Longitude
              <input
                name="destinationLon"
                inputMode="decimal"
                value={coordinates.destinationLon}
                onChange={(event) =>
                  updateCoordinate("destinationLon", event.target.value)
                }
              />
            </label>
          </div>
        </fieldset>

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
