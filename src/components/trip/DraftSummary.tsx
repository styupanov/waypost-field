"use client";

import { useState } from "react";
import RouteStops from "@/components/trip/RouteStops";
import TripSummary from "@/components/trip/TripSummary";
import styles from "./TripIntentPanel.module.css";
import { isAttractionStop, isOvernightStop, type DraftEditAction, type TripDraft } from "@/types/trip";

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
  onLoadOvernightAlternatives: (nightIndex: number) => Promise<void>;
  onChangeOvernight: (nightIndex: number, geonameId: number) => Promise<void>;
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
  onLoadOvernightAlternatives,
  onChangeOvernight,
}: DraftSummaryProps) {
  const [changingNight, setChangingNight] = useState<number | null>(null);
  const replacementTarget = draft.stops.find(
    (stop) =>
      isAttractionStop(stop) && stop.attractionId === replacementTargetId
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

      {draft.multiDay.isMultiDay ? <section className={styles.overnightSection}>
        <h3>Overnights</h3>
        {draft.stops.filter(isOvernightStop).sort((a,b) => a.nightIndex-b.nightIndex).map((stop) => {
          const alternatives = draft.overnightAlternatives.find((night) => night.nightIndex === stop.nightIndex)?.candidates ?? [];
          return <div className={styles.overnightRow} key={stop.nightIndex}>
            <div><small>Night {stop.nightIndex}</small><strong>{stop.label}{stop.admin1Code ? `, ${stop.admin1Code}` : ""} area</strong></div>
            <button type="button" disabled={isEditing} onClick={async () => { if (changingNight === stop.nightIndex) { setChangingNight(null); return; } await onLoadOvernightAlternatives(stop.nightIndex); setChangingNight(stop.nightIndex); }}>Change</button>
            {changingNight === stop.nightIndex ? <ul>{alternatives.filter((candidate) => candidate.geonameId !== stop.geonameId).map((candidate) => <li key={candidate.geonameId}><div><strong>{candidate.name}{candidate.admin1Code ? `, ${candidate.admin1Code}` : ""} area</strong><small>≈ {Math.round(candidate.targetTimeDeviationMinutes)} min from target · +{Math.round(candidate.detourDurationSeconds/60)} min driving</small></div><button type="button" disabled={isEditing} onClick={async () => { await onChangeOvernight(stop.nightIndex, candidate.geonameId); setChangingNight(null); }}>Choose</button></li>)}</ul> : null}
          </div>;
        })}
      </section> : null}

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
