import styles from "./TripIntentPanel.module.css";
import {
  formatApproximateDistance,
  formatApproximateDuration,
} from "@/lib/trip/formatters";
import type { TripDraft } from "@/types/trip";
import type { FinalizedTripWorkspace } from "@/types/final-route";

type TripSummaryProps = {
  draft: TripDraft;
  onEditTrip: () => void;
  finalization: FinalizedTripWorkspace | null;
};

export default function TripSummary({ draft, onEditTrip, finalization }: TripSummaryProps) {
  const summary = finalization?.cache.status === "valid" ? finalization.cache.finalRoute.summary : draft.summary;
  const statusLabel = finalization?.tripStatus === "completed_unconfirmed" ? "Completed" : finalization?.tripStatus === "not_traveled" ? "Not traveled" : finalization ? finalization.tripStatus[0].toUpperCase() + finalization.tripStatus.slice(1) : null;
  return (
    <section className={styles.tripSummary} aria-labelledby="trip-summary-heading">
      <div className={styles.draftHeading}>
        <div>
          <h2 id="trip-summary-heading">
            {draft.origin.label} <span aria-hidden="true">→</span> {draft.destination.label}
          </h2>
          <small>{finalization ? `${statusLabel} · ${finalization.cache.status === "valid" ? "Final route · HERE" : "HERE route needs refresh"}` : "Draft · Approximate"}</small>
          {draft.multiDay.isMultiDay ? <p className={styles.multiDaySummary}>{draft.multiDay.selectedDays} days · {draft.multiDay.nights} nights · {formatApproximateDuration(summary.durationSeconds)} driving</p> : null}
        </div>
        {!finalization ? <button type="button" onClick={onEditTrip}>Edit trip</button> : null}
      </div>
      {!finalization || finalization.cache.status === "valid" ? <dl className={styles.summaryMetrics}>
        <div>
          <dt>Driving time</dt>
          <dd>{formatApproximateDuration(summary.durationSeconds)}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{formatApproximateDistance(summary.distanceKm)}</dd>
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
      </dl> : <p className={styles.multiDaySummary}>Historical Draft route shown as map context until the HERE route is refreshed.</p>}
    </section>
  );
}
