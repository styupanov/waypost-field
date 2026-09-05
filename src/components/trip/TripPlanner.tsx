"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSession, signOut } from "next-auth/react";
import MapCanvas from "@/components/map/MapCanvas";
import AlongTheWay from "@/components/trip/AlongTheWay";
import LocalSignInDialog from "@/components/trip/LocalSignInDialog";
import MyTripsDrawer from "@/components/trip/MyTripsDrawer";
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
import { isAttractionStop, isOvernightStop } from "@/types/trip";
import {
  DEFAULT_TRIP_PREFERENCES,
  type DetourTolerance,
  type InterestCategory,
  type StopStyle,
  type TripPreferences,
  type DrivingPace,
} from "@/types/preferences";
import { calculateTripDayRecommendation } from "@/lib/trip/multi-day";
import type { FinalRoutePreview, FinalRoutePreviewState } from "@/types/final-route";

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

type PlannerSession = { email?: string | null; name?: string | null } | null;

export default function TripPlanner({ initialSession, requestedTripId }: { initialSession: PlannerSession; requestedTripId: string | null }) {
  const [plannerState, setPlannerState] = useState<PlannerState>({
    status: "trip_intent",
  });
  const [origin, setOrigin] = useState(initialOrigin);
  const [stop, setStop] = useState<TripEndpoint | null>(null);
  const [destination, setDestination] = useState(initialDestination);
  const [pickingMode, setPickingMode] = useState<PickingMode>(null);
  const [activePoiId, setActivePoiId] = useState<number | null>(null);
  const [activeNightIndex, setActiveNightIndex] = useState<number | null>(null);
  const [mapFocusCoordinates, setMapFocusCoordinates] = useState<Coordinates[] | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<number | null>(null);
  const [replacementTargetId, setReplacementTargetId] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isAlongTheWayOpen, setIsAlongTheWayOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<PlannerSession>(initialSession);
  const [ownedTripId, setOwnedTripId] = useState<string | null>(null);
  const [ownershipStatus, setOwnershipStatus] = useState<"unsaved" | "saving" | "saved" | "error">("unsaved");
  const [authPurpose, setAuthPurpose] = useState<"save" | "trips" | "open-trip" | null>(null);
  const [isMyTripsOpen, setIsMyTripsOpen] = useState(false);
  const [savedTripState, setSavedTripState] = useState<"idle" | "loading" | "forbidden" | "error">(
    requestedTripId ? (initialSession ? "loading" : "forbidden") : "idle"
  );
  const [findingAlternatives, setFindingAlternatives] = useState(false);
  const editRequestInFlight = useRef(false);
  const previewRequestInFlight = useRef(false);
  const [finalPreview, setFinalPreview] = useState<FinalRoutePreviewState>({ status: "idle" });
  const [preferences, setPreferences] = useState<TripPreferences>(() => ({
    ...DEFAULT_TRIP_PREFERENCES,
    preferredCategories: [],
    excludedCategories: [],
  }));

  useEffect(() => {
    if (!requestedTripId || !sessionUser) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/trips/${requestedTripId}`);
      if (!response.ok) { if (!cancelled) setSavedTripState(response.status === 404 ? "forbidden" : "error"); return; }
      const data = await response.json() as { tripId: string; draft: TripDraft };
      if (cancelled) return;
      const draft = data.draft;
      setOwnedTripId(data.tripId); setOwnershipStatus("saved"); setSavedTripState("idle");
      setPlannerState({ status: "draft_ready", draft, isDirty: false }); setPreferences(draft.preferences);
      setActiveNightIndex(null); setMapFocusCoordinates(null);
      setFinalPreview({ status: "idle" });
      setOrigin({ input: draft.origin.label, coordinates: draft.origin.coordinates, resolvedLabel: draft.origin.label, source: "text" });
      setDestination({ input: draft.destination.label, coordinates: draft.destination.coordinates, resolvedLabel: draft.destination.label, source: "text" });
      setStop(draft.stop ? { input: draft.stop.label, coordinates: draft.stop.coordinates, resolvedLabel: draft.stop.label, source: "text" } : null);
      setFindingAlternatives(true);
      const alternativesResponse = await fetch(`/api/trips/${data.tripId}/alternatives`, { method: "POST" });
      if (alternativesResponse.ok && !cancelled) {
        const result = await alternativesResponse.json() as { alternatives: TripDraft["alternatives"] };
        setPlannerState((current) => current.status === "draft_ready" ? { ...current, draft: { ...current.draft, alternatives: result.alternatives } } : current);
      }
      if (!cancelled) setFindingAlternatives(false);
    })();
    return () => { cancelled = true; };
  }, [requestedTripId, sessionUser]);

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

  function updateDrivingPace(drivingPace: DrivingPace) {
    updatePreferences((current) => {
      const changed = { ...current, drivingPace };
      if (!visibleDraft) return changed;
      const plan = calculateTripDayRecommendation(visibleDraft.baselineSummary.durationSeconds, changed);
      return { ...changed, selectedTripDays: plan.selectedDays };
    });
  }

  function updateTripDays(selectedTripDays: number) {
    updatePreferences((current) => ({ ...current, selectedTripDays, tripDaysOverridden: true }));
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
    setFinalPreview({ status: "idle" });
    setPlannerState((current) =>
      current.status === "draft_ready"
        ? { ...current, isDirty: true }
        : current
    );
    if (ownedTripId) setOwnershipStatus("unsaved");
  }

  function startDraftGeneration() {
    setFinalPreview({ status: "idle" });
    if (ownedTripId) setOwnershipStatus("saving");
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
    setPreferences(nextDraft.preferences);
    if (ownedTripId) setOwnershipStatus("saved");
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
    setMapFocusCoordinates(null);
  }

  function failDraftGeneration() {
    if (ownedTripId) setOwnershipStatus("error");
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
  const displayedRoute = useMemo(() => finalPreview.status === "active" ? { type: "Feature" as const, properties: { provider: "here" }, geometry: finalPreview.result.route } : visibleDraft?.route ?? null, [finalPreview, visibleDraft]);

  async function previewFinalRoute() {
    if (!visibleDraft || plannerState.status === "generating_draft" || previewRequestInFlight.current) return;
    previewRequestInFlight.current = true; setFinalPreview({ status: "loading" });
    try {
      const response = await fetch("/api/finalize/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ownedTripId ? { ownedTripId } : { draft: visibleDraft }) });
      const data = await response.json() as FinalRoutePreview | { error?: { message?: string } };
      if (!response.ok || !("provider" in data)) throw new Error("error" in data ? data.error?.message : undefined);
      setFinalPreview({ status: "active", result: data });
    } catch (reason) {
      console.error("Final route preview failed.");
      setFinalPreview({ status: "error", message: reason instanceof Error && reason.message && reason.message !== "Failed to fetch" ? reason.message : "HERE final route preview is unavailable. Your Draft is unchanged." });
    } finally { previewRequestInFlight.current = false; }
  }

  async function editDraft(action: DraftEditAction) {
    if (!visibleDraft || plannerState.status === "generating_draft" || editRequestInFlight.current) {
      return;
    }
    editRequestInFlight.current = true;
    setEditError(null);
    if (ownedTripId) setOwnershipStatus("saving");
    startDraftGeneration();
    try {
      const response = await fetch("/api/draft/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: visibleDraft, action, ownedTripId }),
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
      if (ownedTripId) setOwnershipStatus("saved");
    } catch (reason) {
      failDraftGeneration();
      console.error("Failed to edit draft:", reason);
      setEditError("The draft is unchanged because that edit could not be routed.");
      if (ownedTripId) setOwnershipStatus("error");
    } finally {
      editRequestInFlight.current = false;
    }
  }

  async function loadOvernightAlternatives(nightIndex: number) {
    if (!visibleDraft) return;
    const existing = visibleDraft.overnightAlternatives.find((night) => night.nightIndex === nightIndex);
    if (existing?.candidates.length) return;
    setEditError(null);
    try {
      const response = await fetch("/api/overnights/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: visibleDraft, nightIndex }) });
      if (!response.ok) throw new Error("Candidates unavailable");
      const data = await response.json() as { nights: TripDraft["overnightAlternatives"] };
      setPlannerState((current) => current.status === "draft_ready" ? { ...current, draft: { ...current.draft, overnightAlternatives: [...current.draft.overnightAlternatives.filter((night) => night.nightIndex !== nightIndex), ...data.nights] } } : current);
    } catch (error) { console.error("Failed to load overnight alternatives:", error); setEditError("Overnight alternatives could not be loaded."); }
  }

  async function changeOvernight(nightIndex: number, geonameId: number) {
    if (!visibleDraft || plannerState.status === "generating_draft" || editRequestInFlight.current) return;
    editRequestInFlight.current = true; setEditError(null); if (ownedTripId) setOwnershipStatus("saving"); startDraftGeneration();
    try {
      const response = await fetch("/api/draft/overnight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: visibleDraft, nightIndex, geonameId, ownedTripId }) });
      if (!response.ok) throw new Error("Overnight change failed");
      finishDraftEdit(await response.json() as TripDraft); if (ownedTripId) setOwnershipStatus("saved");
    } catch (error) { failDraftGeneration(); console.error("Failed to change overnight:", error); setEditError("The overnight area is unchanged because rerouting failed."); }
    finally { editRequestInFlight.current = false; }
  }

  async function persistCurrentDraft() {
    if (!visibleDraft || (plannerState.status === "draft_ready" && plannerState.isDirty)) return;
    setOwnershipStatus("saving");
    const response = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: visibleDraft }) });
    if (!response.ok) { setOwnershipStatus("error"); throw new Error("Trip save failed"); }
    const data = await response.json() as { tripId: string };
    setOwnedTripId(data.tripId); setOwnershipStatus("saved"); setAuthPurpose(null);
    window.history.replaceState(null, "", `/?trip=${data.tripId}`);
  }

  function requestSave() {
    if (!sessionUser) { setAuthPurpose("save"); return; }
    void persistCurrentDraft().catch(() => undefined);
  }

  function selectPoi(attractionId: number) {
    const isAlternative = visibleDraft?.alternatives.some(
      (item) => item.attractionId === attractionId
    );
    setActivePoiId(attractionId);
    setActiveNightIndex(null);
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
        route={displayedRoute}
        attractionStops={
          visibleDraft?.stops.filter(isAttractionStop) ?? []
        }
        overnightStops={visibleDraft?.stops.filter(isOvernightStop) ?? []}
        alternatives={visibleDraft?.alternatives ?? []}
        originCoordinates={origin.coordinates}
        stopCoordinates={stop?.coordinates ?? null}
        destinationCoordinates={destination.coordinates}
        pickingMode={pickingMode}
        activePoiId={activePoiId}
        activeNightIndex={activeNightIndex}
        focusCoordinates={mapFocusCoordinates}
        hoveredPoiId={hoveredPoiId}
        isReplacing={replacementTargetId !== null}
        onMapPointSelected={selectMapPoint}
        onPoiHover={setHoveredPoiId}
        onPoiSelect={selectPoi}
        onOvernightSelect={(nightIndex) => { setActivePoiId(null); setActiveNightIndex(nightIndex); }}
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
        onDrivingPaceChange={updateDrivingPace}
        onTripDaysChange={updateTripDays}
        activePoiId={activePoiId}
        activeNightIndex={activeNightIndex}
        hoveredPoiId={hoveredPoiId}
        replacementTargetId={replacementTargetId}
        editError={editError}
        onPoiHover={setHoveredPoiId}
        onPoiSelect={selectPoi}
        onOvernightSelect={(nightIndex) => { setActivePoiId(null); setActiveNightIndex(nightIndex); const overnight = visibleDraft?.stops.find((item) => isOvernightStop(item) && item.nightIndex === nightIndex); if (overnight) setMapFocusCoordinates([overnight.coordinates]); }}
        onDayFocus={setMapFocusCoordinates}
        onStartReplacement={(attractionId) => {
          setReplacementTargetId(attractionId);
          setActivePoiId(attractionId);
          setEditError(null);
          setIsAlongTheWayOpen(true);
        }}
        onCancelReplacement={() => setReplacementTargetId(null)}
        onEditDraft={editDraft}
        ownedTripId={ownedTripId}
        ownershipStatus={ownershipStatus}
        onSave={requestSave}
        onLoadOvernightAlternatives={loadOvernightAlternatives}
        onChangeOvernight={changeOvernight}
        finalPreview={finalPreview}
        onPreviewFinalRoute={() => void previewFinalRoute()}
        onBackToDraft={() => setFinalPreview({ status: "idle" })}
      />
      {visibleDraft && visibleDraft.alternatives.length > 0 ? (
        <AlongTheWay
          alternatives={visibleDraft.alternatives}
          activePoiId={activePoiId}
          hoveredPoiId={hoveredPoiId}
          replacementTargetName={
            visibleDraft.stops.find(
              (stop) =>
                isAttractionStop(stop) &&
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
      {findingAlternatives ? <div className="finding-places" role="status">Finding places along the way…</div> : null}
      <div className="account-control">
        <button onClick={() => { if (sessionUser) setIsMyTripsOpen(true); else setAuthPurpose("trips"); }}>My Trips</button>
        {sessionUser ? <><span>{sessionUser.name || sessionUser.email}</span><button onClick={() => void signOut({ redirectTo: ownedTripId ? `/?trip=${ownedTripId}` : "/" })}>Sign out</button></> : null}
      </div>
      <MyTripsDrawer open={isMyTripsOpen && Boolean(sessionUser)} currentTripId={ownedTripId ?? requestedTripId} onClose={() => setIsMyTripsOpen(false)} />
      {authPurpose ? <LocalSignInDialog onCancel={() => setAuthPurpose(null)} onAuthenticated={async () => { const purpose = authPurpose; const session = await getSession(); setSessionUser(session?.user ?? null); setAuthPurpose(null); if (purpose === "save") await persistCurrentDraft(); else if (purpose === "trips") setIsMyTripsOpen(true); }} /> : null}
      {savedTripState === "loading" ? <div className="load-gate">Loading saved trip…</div> : null}
      {savedTripState === "forbidden" ? <div className="load-gate"><div><p>{sessionUser ? "You don't have access to this saved trip." : "Sign in to open this saved trip."}</p>{!sessionUser ? <button onClick={() => setAuthPurpose("open-trip")}>Sign in</button> : null}</div></div> : null}
      {savedTripState === "error" ? <div className="load-gate">The saved trip could not be loaded.</div> : null}
    </>
  );
}
