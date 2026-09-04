import styles from "./TripIntentPanel.module.css";
import {
  formatApproximateDistance,
  formatApproximateDuration,
} from "@/lib/trip/formatters";
import type { TripDraft } from "@/types/trip";

type DraftSummaryProps = {
  draft: TripDraft;
  isDirty: boolean;
};

export default function DraftSummary({ draft, isDirty }: DraftSummaryProps) {
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
                  : "User stop"}
              </small>
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
        {draft.composition.selectedPoiCount} Waypost {draft.composition.selectedPoiCount === 1 ? "stop" : "stops"}
        {draft.composition.selectedPoiCount > 0
          ? ` · +${Math.round(draft.composition.actualDetourSeconds / 60)} min measured driving detour`
          : ""}
      </p>

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
