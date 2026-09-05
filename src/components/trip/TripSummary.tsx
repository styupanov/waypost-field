import styles from "./TripIntentPanel.module.css";
import {
  formatApproximateDistance,
  formatApproximateDuration,
} from "@/lib/trip/formatters";
import type { TripDraft } from "@/types/trip";

type TripSummaryProps = {
  draft: TripDraft;
  onEditTrip: () => void;
};

export default function TripSummary({ draft, onEditTrip }: TripSummaryProps) {
  return (
    <section className={styles.tripSummary} aria-labelledby="trip-summary-heading">
      <div className={styles.draftHeading}>
        <div>
          <h2 id="trip-summary-heading">
            {draft.origin.label} <span aria-hidden="true">→</span> {draft.destination.label}
          </h2>
          <small>Draft · Approximate</small>
          {draft.multiDay.isMultiDay ? <p className={styles.multiDaySummary}>{draft.multiDay.selectedDays} days · {draft.multiDay.nights} nights · {formatApproximateDuration(draft.summary.durationSeconds)} driving</p> : null}
        </div>
        <button type="button" onClick={onEditTrip}>Edit trip</button>
      </div>
      <dl className={styles.summaryMetrics}>
        <div>
          <dt>Driving time</dt>
          <dd>{formatApproximateDuration(draft.summary.durationSeconds)}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{formatApproximateDistance(draft.summary.distanceKm)}</dd>
        </div>
        <div>
          <dt>Attraction stops</dt>
          <dd>{draft.composition.selectedPoiCount}</dd>
        </div>
        {draft.composition.actualDetourSeconds > 0 ? (
          <div>
            <dt>Measured detour</dt>
            <dd>+{Math.round(draft.composition.actualDetourSeconds / 60)} min</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
