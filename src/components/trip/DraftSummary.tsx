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

      <p className={styles.draftRoute}>
        <span>{draft.origin.label}</span>
        <span aria-hidden="true">→</span>
        <span>{draft.destination.label}</span>
      </p>

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
