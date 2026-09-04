"use client";

import { useRef, useState } from "react";
import MapCanvas from "@/components/map/MapCanvas";
import AlongTheWay from "@/components/trip/AlongTheWay";
import TripIntentPanel from "@/components/trip/TripIntentPanel";
import type {
  Coordinates,
  DraftEditAction,
  PlannerState,
  PickingMode,
  TripDraft,
  TripEndpoint,
  TripField,
} from "@/types/trip";
import {
  DEFAULT_TRIP_PREFERENCES,
  type DetourTolerance,
  type InterestCategory,
  type StopStyle,
  type TripPreferences,
} from "@/types/preferences";

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
  const [stop, setStop] = useState<TripEndpoint | null>(null);
  const [destination, setDestination] = useState(initialDestination);
  const [pickingMode, setPickingMode] = useState<PickingMode>(null);
  const [activePoiId, setActivePoiId] = useState<number | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<number | null>(null);
  const [replacementTargetId, setReplacementTargetId] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isAlongTheWayOpen, setIsAlongTheWayOpen] = useState(false);
  const editRequestInFlight = useRef(false);
  const [preferences, setPreferences] = useState<TripPreferences>(() => ({
    ...DEFAULT_TRIP_PREFERENCES,
    preferredCategories: [],
    excludedCategories: [],
  }));

  function updatePreferences(
    update: (current: TripPreferences) => TripPreferences
  ) {
    setPreferences(update);
    markDraftDirty();
  }

  function updatePreferredCategory(
    category: InterestCategory,
    selected: boolean
  ) {
    updatePreferences((current) => ({
      ...current,
      preferredCategories: selected
        ? [...current.preferredCategories.filter((value) => value !== category), category]
        : current.preferredCategories.filter((value) => value !== category),
      excludedCategories: selected
        ? current.excludedCategories.filter((value) => value !== category)
        : current.excludedCategories,
    }));
  }

  function updateExcludedCategory(
    category: InterestCategory,
    selected: boolean
  ) {
    updatePreferences((current) => ({
      ...current,
      preferredCategories: selected
        ? current.preferredCategories.filter((value) => value !== category)
        : current.preferredCategories,
      excludedCategories: selected
        ? [...current.excludedCategories.filter((value) => value !== category), category]
        : current.excludedCategories.filter((value) => value !== category),
    }));
  }

  function updateDetourTolerance(detourTolerance: DetourTolerance) {
    updatePreferences((current) => ({ ...current, detourTolerance }));
  }

  function updateStopStyle(stopStyle: StopStyle) {
    updatePreferences((current) => ({ ...current, stopStyle }));
  }

  function updateEndpointInput(field: TripField, input: string) {
    const update = (current: TripEndpoint): TripEndpoint => ({
      ...current,
      input,
      coordinates: null,
      resolvedLabel: null,
      source: "text",
    });

    switch (field) {
      case "origin":
        setOrigin(update);
        break;
      case "stop":
        setStop((current) => (current ? update(current) : current));
        break;
      case "destination":
        setDestination(update);
        break;
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

    switch (field) {
      case "origin":
        setOrigin(update);
        break;
      case "stop":
        setStop((current) => (current ? update(current) : current));
        break;
      case "destination":
        setDestination(update);
        break;
    }
  }

  function selectMapPoint(field: TripField, coordinates: Coordinates) {
    const endpoint: TripEndpoint = {
      input: coordinateLabel(coordinates),
      coordinates,
      resolvedLabel: coordinateLabel(coordinates),
      source: "map",
    };

    switch (field) {
      case "origin":
        setOrigin(endpoint);
        break;
      case "stop":
        setStop(endpoint);
        break;
      case "destination":
        setDestination(endpoint);
        break;
    }

    setPickingMode(null);

    markDraftDirty();
  }

  function addStop() {
    setStop({
      input: "",
      coordinates: null,
      resolvedLabel: null,
      source: "text",
    });
    markDraftDirty();
  }

  function removeStop() {
    setStop(null);
    setPickingMode((current) => (current === "stop" ? null : current));
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
    setActivePoiId(null);
    setHoveredPoiId(null);
    setReplacementTargetId(null);
    setEditError(null);
    setIsAlongTheWayOpen(false);
  }

  function finishDraftEdit(nextDraft: TripDraft) {
    setPlannerState((current) => ({
      status: "draft_ready",
      draft: nextDraft,
      isDirty:
        current.status === "generating_draft"
          ? current.previousIsDirty
          : false,
    }));
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

  async function editDraft(action: DraftEditAction) {
    if (!visibleDraft || plannerState.status === "generating_draft" || editRequestInFlight.current) {
      return;
    }
    editRequestInFlight.current = true;
    setEditError(null);
    startDraftGeneration();
    try {
      const response = await fetch("/api/draft/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: visibleDraft, action }),
      });
      if (!response.ok) {
        throw new Error("Draft edit could not be routed.");
      }
      const nextDraft = (await response.json()) as TripDraft;
      finishDraftEdit(nextDraft);
      setReplacementTargetId(null);
      setHoveredPoiId(null);
      setActivePoiId(
        action.type === "remove"
          ? null
          : action.type === "replace"
            ? action.replacementAttractionId
            : action.attractionId
      );
    } catch (reason) {
      failDraftGeneration();
      console.error("Failed to edit draft:", reason);
      setEditError("The draft is unchanged because that edit could not be routed.");
    } finally {
      editRequestInFlight.current = false;
    }
  }

  function selectPoi(attractionId: number) {
    const isAlternative = visibleDraft?.alternatives.some(
      (item) => item.attractionId === attractionId
    );
    setActivePoiId(attractionId);
    if (!isAlternative) return;
    setIsAlongTheWayOpen(true);
    if (replacementTargetId !== null) {
      void editDraft({
        type: "replace",
        attractionId: replacementTargetId,
        replacementAttractionId: attractionId,
      });
    }
  }

  return (
    <>
      <MapCanvas
        route={visibleDraft?.route ?? null}
        attractionStops={
          visibleDraft?.stops.filter((item) => item.source !== "user") ?? []
        }
        alternatives={visibleDraft?.alternatives ?? []}
        originCoordinates={origin.coordinates}
        stopCoordinates={stop?.coordinates ?? null}
        destinationCoordinates={destination.coordinates}
        pickingMode={pickingMode}
        activePoiId={activePoiId}
        hoveredPoiId={hoveredPoiId}
        isReplacing={replacementTargetId !== null}
        onMapPointSelected={selectMapPoint}
        onPoiHover={setHoveredPoiId}
        onPoiSelect={selectPoi}
      />
      <TripIntentPanel
        origin={origin}
        stop={stop}
        destination={destination}
        plannerState={plannerState}
        pickingMode={pickingMode}
        preferences={preferences}
        onInputChange={updateEndpointInput}
        onPickingModeChange={setPickingMode}
        onCoordinatesResolved={resolveEndpointCoordinates}
        onAddStop={addStop}
        onRemoveStop={removeStop}
        onGenerationStarted={startDraftGeneration}
        onDraftBuilt={finishDraftGeneration}
        onGenerationFailed={failDraftGeneration}
        onPreferredCategoryChange={updatePreferredCategory}
        onExcludedCategoryChange={updateExcludedCategory}
        onDetourToleranceChange={updateDetourTolerance}
        onStopStyleChange={updateStopStyle}
        activePoiId={activePoiId}
        hoveredPoiId={hoveredPoiId}
        replacementTargetId={replacementTargetId}
        editError={editError}
        onPoiHover={setHoveredPoiId}
        onPoiSelect={selectPoi}
        onStartReplacement={(attractionId) => {
          setReplacementTargetId(attractionId);
          setActivePoiId(attractionId);
          setEditError(null);
          setIsAlongTheWayOpen(true);
        }}
        onCancelReplacement={() => setReplacementTargetId(null)}
        onEditDraft={editDraft}
      />
      {visibleDraft && visibleDraft.alternatives.length > 0 ? (
        <AlongTheWay
          alternatives={visibleDraft.alternatives}
          activePoiId={activePoiId}
          hoveredPoiId={hoveredPoiId}
          replacementTargetName={
            visibleDraft.stops.find(
              (stop) =>
                stop.source !== "user" &&
                stop.attractionId === replacementTargetId
            )?.label ?? null
          }
          isEditing={plannerState.status === "generating_draft"}
          isOpen={isAlongTheWayOpen}
          onToggle={() => setIsAlongTheWayOpen((current) => !current)}
          onPoiHover={setHoveredPoiId}
          onPoiSelect={selectPoi}
          onAdd={(attractionId) => void editDraft({ type: "add", attractionId })}
          onReplace={(replacementAttractionId) => {
            if (replacementTargetId === null) return;
            void editDraft({
              type: "replace",
              attractionId: replacementTargetId,
              replacementAttractionId,
            });
          }}
          onCancelReplacement={() => setReplacementTargetId(null)}
        />
      ) : null}
    </>
  );
}
