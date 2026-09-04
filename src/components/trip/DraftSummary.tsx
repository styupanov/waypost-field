import RouteStops from "@/components/trip/RouteStops";
import TripSummary from "@/components/trip/TripSummary";
import styles from "./TripIntentPanel.module.css";
import type { DraftEditAction, TripDraft } from "@/types/trip";

type DraftSummaryProps = {
  draft: TripDraft;
  isDirty: boolean;
  isEditing: boolean;
  activePoiId: number | null;
  hoveredPoiId: number | null;
  replacementTargetId: number | null;
  editError: string | null;
  onPoiHover: (attractionId: number | null) => void;
  onPoiSelect: (attractionId: number) => void;
  onStartReplacement: (attractionId: number) => void;
  onCancelReplacement: () => void;
  onEdit: (action: DraftEditAction) => void;
  onEditTrip: () => void;
  ownershipStatus: "unsaved" | "saving" | "saved" | "error";
  onSave: () => void;
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
  hoveredPoiId,
  replacementTargetId,
  editError,
  onPoiHover,
  onPoiSelect,
  onStartReplacement,
  onCancelReplacement,
  onEdit,
  onEditTrip,
  ownershipStatus,
  onSave,
}: DraftSummaryProps) {
  const replacementTarget = draft.stops.find(
    (stop) =>
      stop.source !== "user" && stop.attractionId === replacementTargetId
  );

  return (
    <div className={styles.draftWorkspace}>
      <TripSummary draft={draft} onEditTrip={onEditTrip} />
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

      <RouteStops
        draft={draft}
        activePoiId={activePoiId}
        hoveredPoiId={hoveredPoiId}
        replacementTargetId={replacementTargetId}
        isEditing={isEditing}
        onPoiHover={onPoiHover}
        onPoiSelect={onPoiSelect}
        onRemove={(attractionId) => onEdit({ type: "remove", attractionId })}
        onStartReplacement={onStartReplacement}
      />

      {draft.summary.hasToll || draft.summary.hasFerry ? (
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
