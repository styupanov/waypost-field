"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import DraftSummary from "@/components/trip/DraftSummary";
import TripPreferencesPanel from "@/components/trip/TripPreferencesPanel";
import styles from "./TripIntentPanel.module.css";
import type {
  GeocodingResponse,
  GeocodingResult,
} from "@/types/geocoding";
import type {
  Coordinates,
  DraftEndpoint,
  PlannerState,
  PickingMode,
  TripDraft,
  DraftEditAction,
  TripEndpoint,
  TripField,
} from "@/types/trip";
import type {
  DetourTolerance,
  InterestCategory,
  StopStyle,
  TripPreferences,
  DrivingPace,
} from "@/types/preferences";
import type { FinalRoutePreviewState, TripFinalizationState } from "@/types/final-route";

type TripIntentPanelProps = {
  origin: TripEndpoint;
  stop: TripEndpoint | null;
  destination: TripEndpoint;
  plannerState: PlannerState;
  pickingMode: PickingMode;
  preferences: TripPreferences;
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
  onPreferredCategoryChange: (category: InterestCategory, selected: boolean) => void;
  onExcludedCategoryChange: (category: InterestCategory, selected: boolean) => void;
  onDetourToleranceChange: (value: DetourTolerance) => void;
  onStopStyleChange: (value: StopStyle) => void;
  onDrivingPaceChange: (value: DrivingPace) => void;
  onTripDaysChange: (days: number) => void;
  activePoiId: number | null;
  activeNightIndex: number | null;
  hoveredPoiId: number | null;
  replacementTargetId: number | null;
  editError: string | null;
  onPoiHover: (attractionId: number | null) => void;
  onPoiSelect: (attractionId: number) => void;
  onOvernightSelect: (nightIndex: number) => void;
  onDayFocus: (coordinates: Coordinates[]) => void;
  onStartReplacement: (attractionId: number) => void;
  onCancelReplacement: () => void;
  onEditDraft: (action: DraftEditAction) => void;
  ownedTripId: string | null;
  ownershipStatus: "unsaved" | "saving" | "saved" | "error";
  onSave: () => void;
  onLoadOvernightAlternatives: (nightIndex: number) => Promise<void>;
  onChangeOvernight: (nightIndex: number, geonameId: number) => Promise<void>;
  finalPreview: FinalRoutePreviewState;
  onPreviewFinalRoute: () => void;
  onBackToDraft: () => void;
  finalizationState: TripFinalizationState;
  onRequestFinalize: () => void;
  onConfirmFinalize: () => void;
  onCancelFinalize: () => void;
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
  preferences,
  onInputChange,
  onPickingModeChange,
  onCoordinatesResolved,
  onAddStop,
  onRemoveStop,
  onGenerationStarted,
  onDraftBuilt,
  onGenerationFailed,
  onPreferredCategoryChange,
  onExcludedCategoryChange,
  onDetourToleranceChange,
  onStopStyleChange,
  onDrivingPaceChange,
  onTripDaysChange,
  activePoiId,
  activeNightIndex,
  hoveredPoiId,
  replacementTargetId,
  editError,
  onPoiHover,
  onPoiSelect,
  onOvernightSelect,
  onDayFocus,
  onStartReplacement,
  onCancelReplacement,
  onEditDraft,
  ownedTripId,
  ownershipStatus,
  onSave,
  onLoadOvernightAlternatives,
  onChangeOvernight,
  finalPreview,
  onPreviewFinalRoute,
  onBackToDraft,
  finalizationState,
  onRequestFinalize,
  onConfirmFinalize,
  onCancelFinalize,
}: TripIntentPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isEditingTrip, setIsEditingTrip] = useState(false);
  const requestInFlight = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    if (visibleDraft && !isEditingTrip) {
      panelRef.current?.scrollTo({ top: 0 });
    }
  }, [isEditingTrip, visibleDraft]);

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

      const response = await fetch("/api/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: resolvedOrigin,
          stop: resolvedStop,
          destination: resolvedDestination,
          preferences,
          ownedTripId,
          hardUserAttractions: visibleDraft?.stops.filter((item) => item.source === "user_attraction") ?? [],
          existingUserOvernights: visibleDraft?.stops.filter((item) => "type" in item && item.type === "overnight" && item.source === "user") ?? [],
          previousSelectedTripDays: visibleDraft?.multiDay.selectedDays ?? null,
        }),
      });

      if (!response.ok) {
        throw new TripBuildError(
          "The endpoints are set, but routing failed. Please try again."
        );
      }

      const data = (await response.json()) as TripDraft;
      onDraftBuilt(data);
      setIsEditingTrip(false);
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
    <section ref={panelRef} className={styles.panel} aria-label="Trip planner">
      {(!visibleDraft || isEditingTrip) && finalizationState.status !== "planned" ? (
        <h1 id="trip-intent-heading">{visibleDraft ? "Edit trip" : "Plan a trip"}</h1>
      ) : null}
      {(!visibleDraft || isEditingTrip) && finalizationState.status !== "planned" ? <form onSubmit={handleSubmit}>
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

        {!visibleDraft ? (
          <TripPreferencesPanel
            preferences={preferences}
            disabled={isGenerating}
            onPreferredCategoryChange={onPreferredCategoryChange}
            onExcludedCategoryChange={onExcludedCategoryChange}
            onDetourToleranceChange={onDetourToleranceChange}
            onStopStyleChange={onStopStyleChange}
            onDrivingPaceChange={onDrivingPaceChange}
            onTripDaysChange={onTripDaysChange}
          />
        ) : null}

        <button type="submit" disabled={isGenerating || pickingMode !== null}>
          {isGenerating ? "Building route…" : visibleDraft ? "Rebuild trip" : "Build trip"}
        </button>

        {visibleDraft ? (
          <button
            className={styles.cancelEditButton}
            type="button"
            disabled={isGenerating}
            onClick={() => {
              setIsEditingTrip(false);
              onPickingModeChange(null);
            }}
          >
            Cancel editing
          </button>
        ) : null}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </form> : null}
      {visibleDraft ? (
        <DraftSummary
          draft={visibleDraft}
          isDirty={visibleDraftIsDirty}
          isEditing={isGenerating}
          activePoiId={activePoiId}
          activeNightIndex={activeNightIndex}
          hoveredPoiId={hoveredPoiId}
          replacementTargetId={replacementTargetId}
          editError={editError}
          onPoiHover={onPoiHover}
          onPoiSelect={onPoiSelect}
          onOvernightSelect={onOvernightSelect}
          onDayFocus={onDayFocus}
          onStartReplacement={onStartReplacement}
          onCancelReplacement={onCancelReplacement}
          onEdit={onEditDraft}
          onEditTrip={() => setIsEditingTrip(true)}
          ownershipStatus={ownershipStatus}
          onSave={onSave}
          onLoadOvernightAlternatives={onLoadOvernightAlternatives}
          onChangeOvernight={onChangeOvernight}
          finalPreview={finalPreview}
          onPreviewFinalRoute={onPreviewFinalRoute}
          onBackToDraft={onBackToDraft}
          finalizationState={finalizationState}
          onRequestFinalize={onRequestFinalize}
          onConfirmFinalize={onConfirmFinalize}
          onCancelFinalize={onCancelFinalize}
        />
      ) : null}
      {visibleDraft && finalizationState.status !== "planned" ? (
        <div className={styles.tripStyleSection}>
          <h3>Trip style</h3>
          <TripPreferencesPanel
            preferences={preferences}
            disabled={isGenerating}
            onPreferredCategoryChange={onPreferredCategoryChange}
            onExcludedCategoryChange={onExcludedCategoryChange}
            onDetourToleranceChange={onDetourToleranceChange}
            onStopStyleChange={onStopStyleChange}
            baselineDurationSeconds={visibleDraft.baselineSummary.durationSeconds}
            onDrivingPaceChange={onDrivingPaceChange}
            onTripDaysChange={onTripDaysChange}
          />
        </div>
      ) : null}
    </section>
  );
}
