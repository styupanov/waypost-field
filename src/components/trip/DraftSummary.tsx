"use client";

import RouteStops from "@/components/trip/RouteStops";
import TripSummary from "@/components/trip/TripSummary";
import styles from "./TripIntentPanel.module.css";
import { isAttractionStop, isOvernightStop, type Coordinates, type DraftEditAction, type TripDraft } from "@/types/trip";
import type { FinalRoutePreviewState, TripFinalizationState } from "@/types/final-route";
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
}: DraftSummaryProps) {
  const replacementTarget = draft.stops.find(
    (stop) =>
      isAttractionStop(stop) && stop.attractionId === replacementTargetId
  );
  const dayPlansStale = hasStaleDayPlans(draft);

  return (
    <div className={styles.draftWorkspace}>
      <TripSummary draft={draft} onEditTrip={onEditTrip} finalization={finalizationState.status === "planned" ? finalizationState.result : null} />
      {finalizationState.status === "planned" ? <section className={styles.finalizedNotice} aria-label="Planned trip">
        <strong>PLANNED</strong>
        <span>Final route · HERE</span>
        <small>Finalized {new Date(finalizationState.result.finalizedAt).toLocaleString()}</small>
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
        {finalizationState.status === "confirming" ? <div role="dialog" aria-label="Finalize this trip?">
          <strong>Finalize this trip?</strong><p>We&apos;ll calculate the final route through your selected stops with HERE. The finalized version can&apos;t be edited.</p>
          <span><button type="button" onClick={onCancelFinalize}>Cancel</button><button type="button" onClick={onConfirmFinalize}>Finalize trip</button></span>
        </div> : <button type="button" disabled={isDirty || dayPlansStale || isEditing || finalizationState.status === "finalizing"} onClick={onRequestFinalize}>{finalizationState.status === "finalizing" ? "Finalizing trip…" : "Finalize trip"}</button>}
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
        <p className={styles.draftNotice}>This trip is finalized and can&apos;t be edited.</p>
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
