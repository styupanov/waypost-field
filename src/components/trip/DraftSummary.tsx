"use client";

import RouteStops from "@/components/trip/RouteStops";
import TripSummary from "@/components/trip/TripSummary";
import styles from "./TripIntentPanel.module.css";
import { isAttractionStop, isOvernightStop, type Coordinates, type DraftEditAction, type TripDraft } from "@/types/trip";
import type { FinalRoutePreviewState, TripFinalizationState, TripLifecycleActionState } from "@/types/final-route";
import { formatApproximateDistance, formatApproximateDuration } from "@/lib/trip/formatters";
import { hasStaleDayPlans } from "@/lib/trip/day-plan-coherence";

type DraftSummaryProps = {
  draft: TripDraft;
  isDirty: boolean;
  isEditing: boolean;
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
  onEdit: (action: DraftEditAction) => void;
  onEditTrip: () => void;
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
  refreshStatus: "idle" | "refreshing" | "error";
  onRefreshFinalRoute: () => void;
  creditBalance: number | null;
  lifecycleActionState: TripLifecycleActionState;
  onRequestStart: () => void;
  onConfirmStart: () => void;
  onRequestComplete: () => void;
  onConfirmComplete: () => void;
  onCancelLifecycleAction: () => void;
};

function signedDuration(seconds: number) {
  const sign = seconds >= 0 ? "+" : "−";
  return `${sign}${Math.round(Math.abs(seconds) / 60)} min`;
}

function signedDistance(kilometers: number) {
  const sign = kilometers >= 0 ? "+" : "−";
  return `${sign}${Math.round(Math.abs(kilometers))} km`;
}

export default function DraftSummary({
  draft,
  isDirty,
  isEditing,
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
  onEdit,
  onEditTrip,
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
  refreshStatus,
  onRefreshFinalRoute,
  creditBalance,
  lifecycleActionState,
  onRequestStart,
  onConfirmStart,
  onRequestComplete,
  onConfirmComplete,
  onCancelLifecycleAction,
}: DraftSummaryProps) {
  const replacementTarget = draft.stops.find(
    (stop) =>
      isAttractionStop(stop) && stop.attractionId === replacementTargetId
  );
  const dayPlansStale = hasStaleDayPlans(draft);

  return (
    <div className={styles.draftWorkspace}>
      <TripSummary draft={draft} onEditTrip={onEditTrip} finalization={finalizationState.status === "planned" ? finalizationState.result : null} />
      {finalizationState.status === "planned" ? <section className={styles.finalizedNotice} aria-label="Finalized trip status">
        <strong>{finalizationState.result.tripStatus === "planned" ? "PLANNED" : finalizationState.result.tripStatus === "active" ? "ACTIVE" : "TRIP COMPLETED"}</strong>
        {finalizationState.result.cache.status === "valid" ? <>
          <span>Final route · HERE</span>
          <small>Route refreshed {new Date(finalizationState.result.cache.fetchedAt).toLocaleDateString()} · Available until {new Date(finalizationState.result.cache.expiresAt).toLocaleDateString()}</small>
        </> : <>
          <span>Final route needs refresh</span>
          <small>Your trip is still finalized. Refresh the route to restore the current HERE geometry and driving estimates.</small>
          <button type="button" disabled={refreshStatus === "refreshing"} onClick={onRefreshFinalRoute}>{refreshStatus === "refreshing" ? "Refreshing final route…" : "Refresh final route"}</button>
          {refreshStatus === "error" ? <small role="alert">The final HERE route could not be refreshed. Your finalized trip is unchanged.</small> : null}
        </>}
        <small>Finalized {new Date(finalizationState.result.finalizedAt).toLocaleString()}</small>
        {finalizationState.result.startedAt ? <small>Started {new Date(finalizationState.result.startedAt).toLocaleString()}</small> : null}
        {finalizationState.result.endedAt ? <small>Ended {new Date(finalizationState.result.endedAt).toLocaleString()}</small> : null}
        {finalizationState.result.tripStatus === "planned" ? (
          lifecycleActionState.status === "confirming_start" ? <div role="dialog" aria-label="Start this trip?">
            <strong>Start this trip?</strong><p>This will mark the trip as active.</p>
            <span><button type="button" onClick={onCancelLifecycleAction}>Cancel</button><button type="button" onClick={onConfirmStart}>Start trip</button></span>
          </div> : <button type="button" disabled={lifecycleActionState.status === "starting"} onClick={onRequestStart}>{lifecycleActionState.status === "starting" ? "Starting trip…" : "Start trip"}</button>
        ) : null}
        {finalizationState.result.tripStatus === "active" ? <>
          <span>Trip in progress</span>
          {lifecycleActionState.status === "confirming_complete" ? <div role="dialog" aria-label="End this trip?">
            <strong>End this trip?</strong><p>We&apos;ll mark the trip as completed. You&apos;ll confirm what you actually traveled in the next step.</p>
            <span><button type="button" onClick={onCancelLifecycleAction}>Cancel</button><button type="button" onClick={onConfirmComplete}>End trip</button></span>
          </div> : <button type="button" disabled={lifecycleActionState.status === "completing"} onClick={onRequestComplete}>{lifecycleActionState.status === "completing" ? "Ending trip…" : "End trip"}</button>}
        </> : null}
        {finalizationState.result.tripStatus === "completed_unconfirmed" ? <small>Travel confirmation is still needed before this trip is added to your map.</small> : null}
        {lifecycleActionState.status === "error" ? <small role="alert">{lifecycleActionState.message}</small> : null}
      </section> : finalPreview.status === "active" ? <section className={styles.finalPreview} aria-label="Final route preview">
        <div><strong>Final route preview</strong><small>HERE · Temporary preview</small></div>
        <dl><div><dt>Driving time</dt><dd>{formatApproximateDuration(finalPreview.result.summary.durationSeconds)}</dd></div><div><dt>Distance</dt><dd>{formatApproximateDistance(finalPreview.result.summary.distanceKm)}</dd></div></dl>
        <button type="button" onClick={onBackToDraft}>Back to draft</button>
      </section> : <div className={styles.previewAction}>
        <button type="button" disabled={isDirty || isEditing || finalPreview.status === "loading"} onClick={onPreviewFinalRoute}>{finalPreview.status === "loading" ? "Preparing HERE preview…" : "Preview final route"}</button>
        <small>Uses HERE for a temporary final-route preview. Your Draft stays unchanged.</small>
        {finalPreview.status === "error" ? <span role="alert">{finalPreview.message}</span> : null}
      </div>}
      {ownershipStatus === "saved" && finalizationState.status !== "planned" ? <div className={styles.finalizeAction}>
        {creditBalance !== null ? <small className={styles.creditBalance}>Trip Credits: {creditBalance}</small> : null}
        {finalizationState.status === "confirming" ? <div role="dialog" aria-label="Finalize this trip?">
          <strong>Finalize this trip?</strong><p>We&apos;ll calculate the final road-ready route through your selected stops. This uses 1 Trip Credit and creates a finalized version that can&apos;t be edited.</p>
          <span><button type="button" onClick={onCancelFinalize}>Cancel</button><button type="button" onClick={onConfirmFinalize}>Finalize · 1 Credit</button></span>
        </div> : <button type="button" disabled={creditBalance === null || creditBalance < 1 || isDirty || dayPlansStale || isEditing || finalizationState.status === "finalizing"} onClick={onRequestFinalize}>{finalizationState.status === "finalizing" ? "Finalizing trip…" : "Finalize trip · 1 Credit"}</button>}
        {creditBalance === 0 ? <small>No Trip Credits available. You need 1 Trip Credit to finalize this trip.</small> : null}
        {isDirty || dayPlansStale ? <small>Rebuild the trip before finalizing.</small> : null}
        {finalizationState.status === "error" ? <small role="alert">{finalizationState.message}</small> : null}
      </div> : null}
      <div className={styles.ownershipAction}>
        {ownershipStatus === "saved" ? <span>Saved to your map</span> : (
          <button type="button" disabled={isDirty || isEditing || ownershipStatus === "saving"} onClick={onSave}>
            {ownershipStatus === "saving" ? "Saving…" : "Save this to your map"}
          </button>
        )}
        {isDirty ? <small>Rebuild the trip before saving.</small> : null}
        {ownershipStatus === "error" ? <small role="alert">The trip is not saved. Please try again.</small> : null}
      </div>
      {finalizationState.status !== "planned" && draft.lastEdit ? (
        <p className={styles.editImpact} role="status">
          Route updated · {signedDuration(draft.lastEdit.deltaDurationSeconds)} driving · {signedDistance(draft.lastEdit.deltaDistanceKm)}
        </p>
      ) : null}
      {editError ? <p className={styles.error} role="alert">{editError}</p> : null}
      {isEditing ? <p className={styles.editingNotice}>Updating route…</p> : null}

      {finalizationState.status !== "planned" && replacementTarget ? (
        <div className={styles.replacementMode} role="status">
          <span>Replacing</span>
          <strong>{replacementTarget.label}</strong>
          <span>Choose another place on the map or below.</span>
          <button type="button" disabled={isEditing} onClick={onCancelReplacement}>
            Cancel
          </button>
        </div>
      ) : null}

      {finalizationState.status !== "planned" && dayPlansStale ? <p className={styles.dayPlansStale} role="status">Trip structure changed. Rebuild to refresh day suggestions.</p> : null}
      <RouteStops
        key={`${draft.multiDay.selectedDays}-${draft.stops.filter(isOvernightStop).map((stop) => stop.geonameId).join("-")}`}
        draft={draft}
        activePoiId={activePoiId}
        activeNightIndex={activeNightIndex}
        hoveredPoiId={hoveredPoiId}
        replacementTargetId={replacementTargetId}
        isEditing={isEditing || finalizationState.status === "planned"}
        readOnly={finalizationState.status === "planned"}
        onPoiHover={onPoiHover}
        onPoiSelect={onPoiSelect}
        onOvernightSelect={onOvernightSelect}
        onDayFocus={onDayFocus}
        onRemove={(attractionId) => onEdit({ type: "remove", attractionId })}
        onStartReplacement={onStartReplacement}
        onLoadOvernightAlternatives={onLoadOvernightAlternatives}
        onChangeOvernight={onChangeOvernight}
      />

      {finalizationState.status !== "planned" && finalPreview.status !== "active" && (draft.summary.hasToll || draft.summary.hasFerry) ? (
        <ul className={styles.routeIndicators} aria-label="Route indicators">
          {draft.summary.hasToll ? <li>Includes tolls</li> : null}
          {draft.summary.hasFerry ? <li>Includes a ferry</li> : null}
        </ul>
      ) : null}
      {finalizationState.status === "planned" ? (
        <p className={styles.draftNotice}>{finalizationState.result.tripStatus === "completed_unconfirmed" ? "This trip is finalized and completed; travel confirmation is still pending." : "This trip is finalized and can&apos;t be edited."}</p>
      ) : isDirty ? (
        <p className={styles.dirtyNotice} role="status">
          Trip inputs changed — rebuild route.
        </p>
      ) : (
        <p className={styles.draftNotice}>
          This draft is mutable and not a finalized trip.
        </p>
      )}
    </div>
  );
}
