"use client";

import { useState } from "react";
import MapCanvas from "@/components/map/MapCanvas";
import TripIntentPanel from "@/components/trip/TripIntentPanel";
import type { RouteFeature } from "@/types/route";
import type {
  Coordinates,
  PickingMode,
  TripEndpoint,
  TripField,
} from "@/types/trip";

const initialOrigin: TripEndpoint = {
  input: "Charlotte, NC",
  coordinates: null,
  source: "text",
};

const initialDestination: TripEndpoint = {
  input: "Denver, CO",
  coordinates: null,
  source: "text",
};

function coordinateLabel(coordinates: Coordinates) {
  return `${coordinates.lat.toFixed(5)}, ${coordinates.lon.toFixed(5)}`;
}

export default function TripPlanner() {
  const [route, setRoute] = useState<RouteFeature | null>(null);
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [pickingMode, setPickingMode] = useState<PickingMode>(null);

  function updateEndpointInput(field: TripField, input: string) {
    const update = (current: TripEndpoint): TripEndpoint => ({
      ...current,
      input,
      coordinates: null,
      source: "text",
    });

    if (field === "origin") {
      setOrigin(update);
    } else {
      setDestination(update);
    }
  }

  function resolveEndpointCoordinates(
    field: TripField,
    coordinates: Coordinates
  ) {
    const update = (current: TripEndpoint): TripEndpoint => ({
      ...current,
      coordinates,
      source: "text",
    });

    if (field === "origin") {
      setOrigin(update);
    } else {
      setDestination(update);
    }
  }

  function selectMapPoint(field: TripField, coordinates: Coordinates) {
    const endpoint: TripEndpoint = {
      input: coordinateLabel(coordinates),
      coordinates,
      source: "map",
    };

    if (field === "origin") {
      setOrigin(endpoint);
    } else {
      setDestination(endpoint);
    }

    setPickingMode(null);
  }

  return (
    <>
      <MapCanvas
        route={route}
        originCoordinates={origin.coordinates}
        destinationCoordinates={destination.coordinates}
        pickingMode={pickingMode}
        onMapPointSelected={selectMapPoint}
      />
      <TripIntentPanel
        origin={origin}
        destination={destination}
        pickingMode={pickingMode}
        onInputChange={updateEndpointInput}
        onPickingModeChange={setPickingMode}
        onCoordinatesResolved={resolveEndpointCoordinates}
        onRouteBuilt={setRoute}
      />
    </>
  );
}
