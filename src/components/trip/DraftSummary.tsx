"use client";

import RouteStops from "@/components/trip/RouteStops";
import TripSummary from "@/components/trip/TripSummary";
import styles from "./TripIntentPanel.module.css";
import { isAttractionStop, isOvernightStop, type Coordinates, type DraftEditAction, type TripDraft } from "@/types/trip";
import type { FinalRoutePreviewState } from "@/types/final-route";
import { formatApproximateDistance, formatApproximateDuration } from "@/lib/trip/formatters";

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
}: DraftSummaryProps) {
  const replacementTarget = draft.stops.find(
    (stop) =>
      isAttractionStop(stop) && stop.attractionId === replacementTargetId
  );
  const dayPlansStale = draft.multiDay.isMultiDay && draft.dayPlans.some((plan) => {
    if (plan.end.kind !== "overnight" || plan.end.nightIndex === null) return false;
    const current = draft.stops.find((stop) => isOvernightStop(stop) && stop.nightIndex === plan.end.nightIndex);
    return !current || current.label !== plan.end.label || current.coordinates.lat !== plan.end.coordinates.lat || current.coordinates.lon !== plan.end.coordinates.lon;
  });

  return (
    <div className={styles.draftWorkspace}>
      <TripSummary draft={draft} onEditTrip={onEditTrip} />
      {finalPreview.status === "active" ? <section className={styles.finalPreview} aria-label="Final route preview">
        <div><strong>Final route preview</strong><small>HERE · Temporary preview</small></div>
        <dl><div><dt>Driving time</dt><dd>{formatApproximateDuration(finalPreview.result.summary.durationSeconds)}</dd></div><div><dt>Distance</dt><dd>{formatApproximateDistance(finalPreview.result.summary.distanceKm)}</dd></div></dl>
        <button type="button" onClick={onBackToDraft}>Back to draft</button>
      </section> : <div className={styles.previewAction}>
        <button type="button" disabled={isDirty || isEditing || finalPreview.status === "loading"} onClick={onPreviewFinalRoute}>{finalPreview.status === "loading" ? "Preparing HERE preview…" : "Preview final route"}</button>
        <small>Uses HERE for a temporary final-route preview. Your Draft stays unchanged.</small>
        {finalPreview.status === "error" ? <span role="alert">{finalPreview.message}</span> : null}
      </div>}
      <div className={styles.ownershipAction}>
        {ownershipStatus === "saved" ? <span>Saved to your map</span> : (
          <button type="button" disabled={isDirty || isEditing || ownershipStatus === "saving"} onClick={onSave}>
            {ownershipStatus === "saving" ? "Saving…" : "Save this to your map"}
          </button>
        )}
        {isDirty ? <small>Rebuild the trip before saving.</small> : null}
        {ownershipStatus === "error" ? <small role="alert">The trip is not saved. Please try again.</small> : null}
      </div>
      {draft.lastEdit ? (
        <p className={styles.editImpact} role="status">
          Route updated · {signedDuration(draft.lastEdit.deltaDurationSeconds)} driving · {signedDistance(draft.lastEdit.deltaDistanceKm)}
        </p>
      ) : null}
      {editError ? <p className={styles.error} role="alert">{editError}</p> : null}
      {isEditing ? <p className={styles.editingNotice}>Updating route…</p> : null}

      {replacementTarget ? (
        <div className={styles.replacementMode} role="status">
          <span>Replacing</span>
          <strong>{replacementTarget.label}</strong>
          <span>Choose another place on the map or below.</span>
          <button type="button" disabled={isEditing} onClick={onCancelReplacement}>
            Cancel
          </button>
        </div>
      ) : null}

      {dayPlansStale ? <p className={styles.dayPlansStale} role="status">Trip structure changed. Rebuild to refresh day suggestions.</p> : null}
      <RouteStops
        key={`${draft.multiDay.selectedDays}-${draft.stops.filter(isOvernightStop).map((stop) => stop.geonameId).join("-")}`}
        draft={draft}
        activePoiId={activePoiId}
        activeNightIndex={activeNightIndex}
        hoveredPoiId={hoveredPoiId}
        replacementTargetId={replacementTargetId}
        isEditing={isEditing}
        onPoiHover={onPoiHover}
        onPoiSelect={onPoiSelect}
        onOvernightSelect={onOvernightSelect}
        onDayFocus={onDayFocus}
        onRemove={(attractionId) => onEdit({ type: "remove", attractionId })}
        onStartReplacement={onStartReplacement}
        onLoadOvernightAlternatives={onLoadOvernightAlternatives}
        onChangeOvernight={onChangeOvernight}
      />

      {finalPreview.status !== "active" && (draft.summary.hasToll || draft.summary.hasFerry) ? (
        <ul className={styles.routeIndicators} aria-label="Route indicators">
          {draft.summary.hasToll ? <li>Includes tolls</li> : null}
          {draft.summary.hasFerry ? <li>Includes a ferry</li> : null}
        </ul>
      ) : null}
      {isDirty ? (
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
