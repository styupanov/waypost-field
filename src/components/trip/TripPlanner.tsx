"use client";

import { useState } from "react";
import MapCanvas from "@/components/map/MapCanvas";
import TripIntentPanel from "@/components/trip/TripIntentPanel";
import type {
  Coordinates,
  PlannerState,
  PickingMode,
  TripDraft,
  TripEndpoint,
  TripField,
} from "@/types/trip";

const initialOrigin: TripEndpoint = {
  input: "Charlotte, NC",
  coordinates: null,
  resolvedLabel: null,
  source: "text",
};

const initialDestination: TripEndpoint = {
  input: "Denver, CO",
  coordinates: null,
  resolvedLabel: null,
  source: "text",
};

function coordinateLabel(coordinates: Coordinates) {
  return `${coordinates.lat.toFixed(5)}, ${coordinates.lon.toFixed(5)}`;
}

export default function TripPlanner() {
  const [plannerState, setPlannerState] = useState<PlannerState>({
    status: "trip_intent",
  });
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [pickingMode, setPickingMode] = useState<PickingMode>(null);

  function updateEndpointInput(field: TripField, input: string) {
    const update = (current: TripEndpoint): TripEndpoint => ({
      ...current,
      input,
      coordinates: null,
      resolvedLabel: null,
      source: "text",
    });

    if (field === "origin") {
      setOrigin(update);
    } else {
      setDestination(update);
    }

    markDraftDirty();
  }

  function resolveEndpointCoordinates(
    field: TripField,
    coordinates: Coordinates,
    resolvedLabel: string
  ) {
    const update = (current: TripEndpoint): TripEndpoint => ({
      ...current,
      coordinates,
      resolvedLabel,
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
      resolvedLabel: coordinateLabel(coordinates),
      source: "map",
    };

    if (field === "origin") {
      setOrigin(endpoint);
    } else {
      setDestination(endpoint);
    }

    setPickingMode(null);

    markDraftDirty();
  }

  function markDraftDirty() {
    setPlannerState((current) =>
      current.status === "draft_ready"
        ? { ...current, isDirty: true }
        : current
    );
  }

  function startDraftGeneration() {
    setPlannerState((current) => {
      if (current.status === "generating_draft") {
        return current;
      }

      if (current.status === "draft_ready") {
        return {
          status: "generating_draft",
          previousDraft: current.draft,
          previousIsDirty: current.isDirty,
        };
      }

      return {
        status: "generating_draft",
        previousDraft: null,
        previousIsDirty: false,
      };
    });
  }

  function finishDraftGeneration(nextDraft: TripDraft) {
    setPlannerState({
      status: "draft_ready",
      draft: nextDraft,
      isDirty: false,
    });
  }

  function failDraftGeneration() {
    setPlannerState((current) => {
      if (current.status !== "generating_draft") {
        return current;
      }

      if (current.previousDraft) {
        return {
          status: "draft_ready",
          draft: current.previousDraft,
          isDirty: current.previousIsDirty,
        };
      }

      return { status: "trip_intent" };
    });
  }

  const visibleDraft =
    plannerState.status === "draft_ready"
      ? plannerState.draft
      : plannerState.status === "generating_draft"
        ? plannerState.previousDraft
        : null;

  return (
    <>
      <MapCanvas
        route={visibleDraft?.route ?? null}
        originCoordinates={origin.coordinates}
        destinationCoordinates={destination.coordinates}
        pickingMode={pickingMode}
        onMapPointSelected={selectMapPoint}
      />
      <TripIntentPanel
        origin={origin}
        destination={destination}
        plannerState={plannerState}
        pickingMode={pickingMode}
        onInputChange={updateEndpointInput}
        onPickingModeChange={setPickingMode}
        onCoordinatesResolved={resolveEndpointCoordinates}
        onGenerationStarted={startDraftGeneration}
        onDraftBuilt={finishDraftGeneration}
        onGenerationFailed={failDraftGeneration}
      />
    </>
  );
}
