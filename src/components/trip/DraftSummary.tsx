"use client";

import { useState } from "react";
import styles from "./TripIntentPanel.module.css";
import {
  formatApproximateDistance,
  formatApproximateDuration,
} from "@/lib/trip/formatters";
import type { DraftEditAction, TripDraft } from "@/types/trip";
import type { InterestCategory } from "@/types/preferences";

type DraftSummaryProps = {
  draft: TripDraft;
  isDirty: boolean;
  isEditing: boolean;
  onEdit: (action: DraftEditAction) => void;
};

const INTEREST_CATEGORY_LABELS: Record<InterestCategory, string> = {
  nature_scenic: "Nature & scenic",
  outdoor_adventure: "Outdoor adventure",
  history_landmarks: "History & landmarks",
  museums_culture: "Museums & culture",
  food_drink: "Food & drink",
  shopping: "Shopping",
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
  onEdit,
}: DraftSummaryProps) {
  const [replacements, setReplacements] = useState<Record<number, string>>({});
  const attractionStops = draft.stops.filter((stop) => stop.source !== "user");
  return (
    <section className={styles.draftSummary} aria-labelledby="draft-heading">
      <div className={styles.draftHeading}>
        <h2 id="draft-heading">Draft</h2>
        <span>Approximate</span>
      </div>

      <ol className={styles.composedStops}>
        <li>{draft.origin.label}</li>
        {draft.stops.map((stop) => (
          <li
            key={
              stop.source === "waypost"
                ? `waypost-${stop.attractionId}`
                : `user-${stop.label}`
            }
          >
            <span aria-hidden="true">↓</span>
            <span>
              {stop.source === "waypost" ? "★ " : ""}
              {stop.label}
              <small>
                {stop.source === "waypost"
                  ? `Waypost suggestion${stop.duration ? ` · ${stop.duration} visit` : ""}`
                  : stop.source === "user_attraction"
                    ? `Added by you${stop.duration ? ` · ${stop.duration} visit` : ""}`
                    : "User stop"}
              </small>
              {stop.source !== "user" ? (
                <button
                  className={styles.inlineAction}
                  type="button"
                  disabled={isEditing}
                  onClick={() =>
                    onEdit({ type: "remove", attractionId: stop.attractionId })
                  }
                >
                  Remove
                </button>
              ) : null}
            </span>
          </li>
        ))}
        <li>
          <span aria-hidden="true">↓</span>
          <span>{draft.destination.label}</span>
        </li>
      </ol>

      <dl className={styles.draftMetrics}>
        <div>
          <dt>Distance</dt>
          <dd>{formatApproximateDistance(draft.summary.distanceKm)}</dd>
        </div>
        <div>
          <dt>Driving time</dt>
          <dd>{formatApproximateDuration(draft.summary.durationSeconds)}</dd>
        </div>
      </dl>

      <p className={styles.compositionSummary}>
        {draft.composition.selectedPoiCount} attraction {draft.composition.selectedPoiCount === 1 ? "stop" : "stops"}
        {draft.composition.selectedPoiCount > 0
          ? ` · +${Math.round(draft.composition.actualDetourSeconds / 60)} min measured driving detour`
          : ""}
      </p>

      {draft.lastEdit ? (
        <p className={styles.editImpact} role="status">
          Latest edit: {signedDuration(draft.lastEdit.deltaDurationSeconds)} driving · {signedDistance(draft.lastEdit.deltaDistanceKm)}
        </p>
      ) : null}

      {attractionStops.length > 0 && draft.alternatives.length > 0 ? (
        <div className={styles.replaceSection}>
          <h3>Replace a suggested stop</h3>
          {attractionStops.map((stop) => {
            const replacementId = Number(
              replacements[stop.attractionId] ??
                draft.alternatives[0].attractionId
            );
            return (
              <div key={`replace-${stop.attractionId}`}>
                <label>
                  Replace {stop.label}
                  <select
                    disabled={isEditing}
                    value={replacementId}
                    onChange={(event) =>
                      setReplacements((current) => ({
                        ...current,
                        [stop.attractionId]: event.target.value,
                      }))
                    }
                  >
                    {draft.alternatives.map((alternative) => (
                      <option
                        key={alternative.attractionId}
                        value={alternative.attractionId}
                      >
                        {alternative.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() =>
                    onEdit({
                      type: "replace",
                      attractionId: stop.attractionId,
                      replacementAttractionId: replacementId,
                    })
                  }
                >
                  Replace
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {draft.alternatives.length > 0 ? (
        <section className={styles.alternatives} aria-labelledby="alternatives-heading">
          <h3 id="alternatives-heading">Along the way</h3>
          <p>Other places considered for this trip. They are not part of the route.</p>
          <ul>
            {draft.alternatives.map((alternative) => (
              <li key={alternative.attractionId}>
                <strong>{alternative.name}</strong>
                <span>
                  {alternative.interestCategory
                    ? INTEREST_CATEGORY_LABELS[alternative.interestCategory]
                    : alternative.rawCategory}
                  {` · ${alternative.rating.toFixed(1)} (${alternative.reviewCount.toLocaleString("en-US")})`}
                </span>
                <span>
                  ≈ {Math.round(alternative.individualDetourDurationSeconds / 60)} min individual driving detour
                  {alternative.duration ? ` · ${alternative.duration} visit` : ""}
                </span>
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() =>
                    onEdit({ type: "add", attractionId: alternative.attractionId })
                  }
                >
                  Add to trip
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
    </section>
  );
}
