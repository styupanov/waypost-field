"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
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
import { resolveDisplayedTripRoute } from "@/lib/trip/display-route";
import { initialWorkspaceMode, showsTripWorkspace, type WorkspaceMode } from "@/lib/trip/workspace-mode";
import type { PersonalCoverageBoundsResponse } from "@/types/coverage";
import type { FinalRoutePreview, FinalRoutePreviewState, FinalizedTripResult, FinalizedTripWorkspace, TripFinalizationState, TripLifecycleActionState, TravelConfirmationActionState } from "@/types/final-route";

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
  const router = useRouter();
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => initialWorkspaceMode(Boolean(initialSession), requestedTripId));
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
  const [finalizationState, setFinalizationState] = useState<TripFinalizationState>({ status: "draft" });
  const [refreshStatus, setRefreshStatus] = useState<"idle" | "refreshing" | "error">("idle");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [lifecycleActionState, setLifecycleActionState] = useState<TripLifecycleActionState>({ status: "idle" });
  const [travelConfirmationState, setTravelConfirmationState] = useState<TravelConfirmationActionState>({ status: "idle" });
  const [coverageRevision, setCoverageRevision] = useState(0);
  const [personalMapCoverageState, setPersonalMapCoverageState] = useState<"idle" | "loading" | "available" | "empty" | "error">(
    initialSession && !requestedTripId ? "loading" : "idle"
  );
  const [personalCoverageBounds, setPersonalCoverageBounds] = useState<PersonalCoverageBoundsResponse["bounds"]>(null);
  const [preferences, setPreferences] = useState<TripPreferences>(() => ({
    ...DEFAULT_TRIP_PREFERENCES,
    preferredCategories: [],
    excludedCategories: [],
  }));

  useEffect(() => {
    if (!sessionUser) return;
    let cancelled = false;
    void fetch("/api/credits").then(async (response) => { if (!response.ok) throw new Error("credits"); return response.json() as Promise<{ balance: number }>; }).then((data) => { if (!cancelled) setCreditBalance(data.balance); }).catch(() => { if (!cancelled) setCreditBalance(null); });
    return () => { cancelled = true; };
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser || workspaceMode !== "personal_map") return;
    let cancelled = false;
    void fetch("/api/map/coverage/bounds").then(async (response) => {
      if (!response.ok) throw new Error("bounds");
      return response.json() as Promise<PersonalCoverageBoundsResponse>;
    }).then((data) => {
      if (cancelled) return;
      setPersonalCoverageBounds(data.bounds);
      setPersonalMapCoverageState(data.hasCoverage ? "available" : "empty");
    }).catch(() => {
      if (!cancelled) setPersonalMapCoverageState("error");
    });
    return () => { cancelled = true; };
  }, [sessionUser, workspaceMode]);

  useEffect(() => {
    if (!requestedTripId || !sessionUser) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/trips/${requestedTripId}`);
      if (!response.ok) { if (!cancelled) setSavedTripState(response.status === 404 ? "forbidden" : "error"); return; }
      const data = await response.json() as { tripId: string; draft: TripDraft; finalization: FinalizedTripWorkspace | null };
      if (cancelled) return;
      const draft = data.draft;
      setWorkspaceMode("trip");
      setOwnedTripId(data.tripId); setOwnershipStatus("saved"); setSavedTripState("idle");
      setPlannerState({ status: "draft_ready", draft, isDirty: false }); setPreferences(draft.preferences);
      setActiveNightIndex(null); setMapFocusCoordinates(null);
      setFinalPreview({ status: "idle" });
      setFinalizationState(data.finalization ? { status: "planned", result: data.finalization } : { status: "draft" });
      setRefreshStatus("idle");
      setLifecycleActionState({ status: "idle" });
      setTravelConfirmationState({ status: "idle" });
      setOrigin({ input: draft.origin.label, coordinates: draft.origin.coordinates, resolvedLabel: draft.origin.label, source: "text" });
      setDestination({ input: draft.destination.label, coordinates: draft.destination.coordinates, resolvedLabel: draft.destination.label, source: "text" });
      setStop(draft.stop ? { input: draft.stop.label, coordinates: draft.stop.coordinates, resolvedLabel: draft.stop.label, source: "text" } : null);
      if (!data.finalization) {
        setFindingAlternatives(true);
        const alternativesResponse = await fetch(`/api/trips/${data.tripId}/alternatives`, { method: "POST" });
        if (alternativesResponse.ok && !cancelled) {
          const result = await alternativesResponse.json() as { alternatives: TripDraft["alternatives"] };
          setPlannerState((current) => current.status === "draft_ready" ? { ...current, draft: { ...current.draft, alternatives: result.alternatives } } : current);
        }
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
    if (finalizationState.status === "planned") return;
    setFinalPreview({ status: "idle" });
    setPlannerState((current) =>
      current.status === "draft_ready"
        ? { ...current, isDirty: true }
        : current
    );
    if (ownedTripId) setOwnershipStatus("unsaved");
  }

  function startDraftGeneration() {
    if (finalizationState.status === "planned") return;
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
  const displayedRoute = useMemo(
    () => resolveDisplayedTripRoute(visibleDraft?.route ?? null, finalizationState, finalPreview),
    [finalPreview, finalizationState, visibleDraft]
  );

  async function finalizeTrip() {
    if (!ownedTripId || !visibleDraft || plannerState.status !== "draft_ready" || plannerState.isDirty || finalizationState.status === "finalizing") return;
    setFinalizationState({ status: "finalizing" });
    try {
      const response = await fetch("/api/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: ownedTripId }) });
      const data = await response.json() as FinalizedTripResult | { error?: { message?: string } };
      if (!response.ok || !("tripStatus" in data)) throw new Error("error" in data ? data.error?.message : undefined);
      const result: FinalizedTripWorkspace = { tripId: data.tripId, versionId: data.versionId, tripStatus: "planned", startedAt: null, endedAt: null, travelConfirmationAt: null, versionState: "finalized", finalizedAt: data.finalizedAt, provider: "here", cache: { status: "valid", provider: "here", fetchedAt: data.cache.fetchedAt, expiresAt: data.cache.expiresAt, finalRoute: data.finalRoute } };
      setFinalPreview({ status: "idle" }); setFinalizationState({ status: "planned", result }); setReplacementTargetId(null); setIsAlongTheWayOpen(false);
      void fetch("/api/credits").then(async (creditsResponse) => { if (creditsResponse.ok) setCreditBalance((await creditsResponse.json() as { balance: number }).balance); }).catch(() => undefined);
    } catch (reason) {
      console.error("Trip finalization failed.");
      setFinalizationState({ status: "error", message: reason instanceof Error && reason.message ? reason.message : "The trip remains a Draft because finalization failed." });
    }
  }

  async function refreshFinalRoute() {
    if (!ownedTripId || finalizationState.status !== "planned" || finalizationState.result.cache.status === "valid" || refreshStatus === "refreshing") return;
    setRefreshStatus("refreshing");
    try {
      const response = await fetch("/api/finalize/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: ownedTripId }) });
      const data = await response.json() as FinalizedTripResult | { error?: { message?: string } };
      if (!response.ok || !("tripStatus" in data)) throw new Error("refresh failed");
      setFinalizationState((current) => current.status === "planned" ? { status: "planned", result: { ...current.result, tripStatus: data.tripStatus, cache: { status: "valid", provider: "here", fetchedAt: data.cache.fetchedAt, expiresAt: data.cache.expiresAt, finalRoute: data.finalRoute } } } : current);
      setRefreshStatus("idle");
    } catch { console.error("Final route refresh failed."); setRefreshStatus("error"); }
  }

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

  async function changeTripLifecycle(action: "start" | "complete") {
    if (!ownedTripId || finalizationState.status !== "planned" || lifecycleActionState.status === "starting" || lifecycleActionState.status === "completing") return;
    setLifecycleActionState({ status: action === "start" ? "starting" : "completing" });
    try {
      const response = await fetch(`/api/trips/${ownedTripId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json() as { status?: "active" | "completed_unconfirmed"; startedAt?: string | null; endedAt?: string | null; error?: { message?: string } };
      if (!response.ok || !data.status) throw new Error(data.error?.message);
      setFinalizationState((current) => current.status === "planned" ? { status: "planned", result: { ...current.result, tripStatus: data.status!, startedAt: data.startedAt ?? null, endedAt: data.endedAt ?? null } } : current);
      setLifecycleActionState({ status: "idle" });
    } catch (reason) {
      console.error(`Failed to ${action} trip lifecycle.`);
      setLifecycleActionState({ status: "error", message: reason instanceof Error && reason.message ? reason.message : `The trip could not be ${action === "start" ? "started" : "ended"}.` });
    }
  }

  async function updateTravelConfirmation(outcome: "traveled" | "not_traveled" | "undo") {
    if (!ownedTripId || finalizationState.status !== "planned" || travelConfirmationState.status === "saving") return;
    setTravelConfirmationState({ status: "saving", action: outcome === "undo" ? "undo" : "confirm" });
    try {
      const response = await fetch(`/api/trips/${ownedTripId}/travel-confirmation`, outcome === "undo"
        ? { method: "DELETE" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome }) });
      const data = await response.json() as { status?: "completed_unconfirmed" | "traveled" | "not_traveled"; startedAt?: string | null; endedAt?: string | null; travelConfirmationAt?: string | null; error?: { message?: string } };
      if (!response.ok || !data.status) throw new Error(data.error?.message);
      setFinalizationState((current) => current.status === "planned" ? { status: "planned", result: { ...current.result, tripStatus: data.status!, startedAt: data.startedAt ?? current.result.startedAt, endedAt: data.endedAt ?? current.result.endedAt, travelConfirmationAt: data.travelConfirmationAt ?? null } } : current);
      setCoverageRevision((current) => current + 1);
      setTravelConfirmationState({ status: "idle" });
    } catch (reason) {
      console.error("Failed to update travel confirmation.");
      setTravelConfirmationState({ status: "error", message: reason instanceof Error && reason.message ? reason.message : "Travel confirmation could not be updated." });
    }
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

  function clearTripContext() {
    setPlannerState({ status: "trip_intent" });
    setOrigin({ ...initialOrigin });
    setStop(null);
    setDestination({ ...initialDestination });
    setPickingMode(null);
    setActivePoiId(null);
    setActiveNightIndex(null);
    setMapFocusCoordinates(null);
    setHoveredPoiId(null);
    setReplacementTargetId(null);
    setEditError(null);
    setIsAlongTheWayOpen(false);
    setOwnedTripId(null);
    setOwnershipStatus("unsaved");
    setSavedTripState("idle");
    setFindingAlternatives(false);
    setFinalPreview({ status: "idle" });
    setFinalizationState({ status: "draft" });
    setRefreshStatus("idle");
    setLifecycleActionState({ status: "idle" });
    setTravelConfirmationState({ status: "idle" });
    setPreferences({
      ...DEFAULT_TRIP_PREFERENCES,
      preferredCategories: [],
      excludedCategories: [],
    });
    setIsMyTripsOpen(false);
  }

  function startNewTrip() {
    clearTripContext();
    setWorkspaceMode("planner");
    router.replace("/");
  }

  function enterPersonalMap() {
    if (plannerState.status === "generating_draft") return;
    if (visibleDraft && ownershipStatus === "unsaved" && !window.confirm("Open My Map? Changes that haven't been rebuilt will be discarded.")) return;
    clearTripContext();
    setPersonalMapCoverageState("loading");
    setPersonalCoverageBounds(null);
    setWorkspaceMode("personal_map");
    router.replace("/");
  }

  const tripWorkspaceVisible = showsTripWorkspace(workspaceMode);

  return (
    <>
      <MapCanvas
        route={tripWorkspaceVisible ? displayedRoute : null}
        attractionStops={
          tripWorkspaceVisible ? visibleDraft?.stops.filter(isAttractionStop) ?? [] : []
        }
        overnightStops={tripWorkspaceVisible ? visibleDraft?.stops.filter(isOvernightStop) ?? [] : []}
        alternatives={tripWorkspaceVisible ? visibleDraft?.alternatives ?? [] : []}
        originCoordinates={tripWorkspaceVisible ? origin.coordinates : null}
        stopCoordinates={tripWorkspaceVisible ? stop?.coordinates ?? null : null}
        destinationCoordinates={tripWorkspaceVisible ? destination.coordinates : null}
        pickingMode={tripWorkspaceVisible ? pickingMode : null}
        activePoiId={tripWorkspaceVisible ? activePoiId : null}
        activeNightIndex={tripWorkspaceVisible ? activeNightIndex : null}
        focusCoordinates={tripWorkspaceVisible ? mapFocusCoordinates : null}
        hoveredPoiId={hoveredPoiId}
        isReplacing={replacementTargetId !== null}
        personalCoverageEnabled={Boolean(sessionUser)}
        coverageRevision={coverageRevision}
        personalMapMode={workspaceMode === "personal_map"}
        personalCoverageBounds={personalCoverageBounds}
        personalMapCameraReady={personalMapCoverageState === "available" || personalMapCoverageState === "empty"}
        onMapPointSelected={selectMapPoint}
        onPoiHover={setHoveredPoiId}
        onPoiSelect={selectPoi}
        onOvernightSelect={(nightIndex) => { setActivePoiId(null); setActiveNightIndex(nightIndex); }}
      />
      {tripWorkspaceVisible ? <TripIntentPanel
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
        finalizationState={finalizationState}
        onRequestFinalize={() => setFinalizationState({ status: "confirming" })}
        onConfirmFinalize={() => void finalizeTrip()}
        onCancelFinalize={() => setFinalizationState({ status: "draft" })}
        refreshStatus={refreshStatus}
        onRefreshFinalRoute={() => void refreshFinalRoute()}
        creditBalance={creditBalance}
        lifecycleActionState={lifecycleActionState}
        onRequestStart={() => setLifecycleActionState({ status: "confirming_start" })}
        onConfirmStart={() => void changeTripLifecycle("start")}
        onRequestComplete={() => setLifecycleActionState({ status: "confirming_complete" })}
        onConfirmComplete={() => void changeTripLifecycle("complete")}
        onCancelLifecycleAction={() => setLifecycleActionState({ status: "idle" })}
        travelConfirmationState={travelConfirmationState}
        onRequestTravelConfirmation={(outcome) => setTravelConfirmationState({ status: "confirming", outcome })}
        onConfirmTravelConfirmation={(outcome) => void updateTravelConfirmation(outcome)}
        onRequestUndoTravelConfirmation={() => setTravelConfirmationState({ status: "confirming_undo" })}
        onConfirmUndoTravelConfirmation={() => void updateTravelConfirmation("undo")}
        onCancelTravelConfirmation={() => setTravelConfirmationState({ status: "idle" })}
      /> : null}
      {tripWorkspaceVisible && visibleDraft && finalizationState.status !== "planned" && visibleDraft.alternatives.length > 0 ? (
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
      {tripWorkspaceVisible && findingAlternatives ? <div className="finding-places" role="status">Finding places along the way…</div> : null}
      {workspaceMode === "personal_map" ? <section className="personal-map-chrome" aria-label="Personal Map">
        <strong>My Map</strong>
        <small>{personalMapCoverageState === "empty" ? "Your map will open up as you travel." : "Your traveled territory"}</small>
        <button type="button" onClick={startNewTrip}>New trip</button>
      </section> : null}
      <div className="account-control">
        {sessionUser && workspaceMode !== "personal_map" ? <button onClick={enterPersonalMap}>My Map</button> : null}
        <button onClick={() => { if (sessionUser) setIsMyTripsOpen(true); else setAuthPurpose("trips"); }}>My Trips</button>
        {sessionUser ? <><span>{sessionUser.name || sessionUser.email}</span><button onClick={() => void signOut({ redirectTo: ownedTripId ? `/?trip=${ownedTripId}` : "/" })}>Sign out</button></> : null}
      </div>
      <MyTripsDrawer
        open={isMyTripsOpen && Boolean(sessionUser)}
        currentTripId={ownedTripId ?? requestedTripId}
        hasClientOnlyChanges={Boolean(visibleDraft) && ownershipStatus === "unsaved"}
        newTripDisabled={plannerState.status === "generating_draft"}
        onClose={() => setIsMyTripsOpen(false)}
        onNewTrip={startNewTrip}
      />
      {authPurpose ? <LocalSignInDialog onCancel={() => setAuthPurpose(null)} onAuthenticated={async () => { const purpose = authPurpose; const session = await getSession(); setSessionUser(session?.user ?? null); setAuthPurpose(null); if (purpose === "save") await persistCurrentDraft(); else if (purpose === "trips") setIsMyTripsOpen(true); }} /> : null}
      {savedTripState === "loading" ? <div className="load-gate">Loading saved trip…</div> : null}
      {savedTripState === "forbidden" ? <div className="load-gate"><div><p>{sessionUser ? "You don't have access to this saved trip." : "Sign in to open this saved trip."}</p>{!sessionUser ? <button onClick={() => setAuthPurpose("open-trip")}>Sign in</button> : null}</div></div> : null}
      {savedTripState === "error" ? <div className="load-gate">The saved trip could not be loaded.</div> : null}
    </>
  );
}
