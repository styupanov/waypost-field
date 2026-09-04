"use client";

import { useEffect, useRef } from "react";
import styles from "./TripIntentPanel.module.css";
import type { DraftAttractionStop, TripDraft } from "@/types/trip";

type RouteStopsProps = {
  draft: TripDraft;
  activePoiId: number | null;
  hoveredPoiId: number | null;
  replacementTargetId: number | null;
  isEditing: boolean;
  onPoiHover: (attractionId: number | null) => void;
  onPoiSelect: (attractionId: number) => void;
  onRemove: (attractionId: number) => void;
  onStartReplacement: (attractionId: number) => void;
};

function AttractionStop({
  stop,
  isActive,
  isReplacing,
  isEditing,
  onPoiHover,
  onPoiSelect,
  onRemove,
  onStartReplacement,
  cardRef,
}: {
  stop: DraftAttractionStop;
  isActive: boolean;
  isReplacing: boolean;
  isEditing: boolean;
  onPoiHover: (attractionId: number | null) => void;
  onPoiSelect: (attractionId: number) => void;
  onRemove: (attractionId: number) => void;
  onStartReplacement: (attractionId: number) => void;
  cardRef: (element: HTMLLIElement | null) => void;
}) {
  return (
    <li
      className={`${styles.routeStop} ${isActive ? styles.poiActive : ""} ${isReplacing ? styles.replacementTarget : ""}`}
      ref={cardRef}
      onMouseEnter={() => onPoiHover(stop.attractionId)}
      onMouseLeave={() => onPoiHover(null)}
    >
      <span
        className={`${styles.routeNode} ${stop.source === "waypost" ? styles.waypostNode : styles.userAttractionNode}`}
        aria-hidden="true"
      />
      <div className={styles.routeStopContent}>
        <button
          className={styles.poiNameButton}
          type="button"
          onClick={() => onPoiSelect(stop.attractionId)}
        >
          {stop.label}
        </button>
        <small>
          {stop.source === "waypost" ? "Waypost suggestion" : "Added by you"}
          {stop.duration ? ` · ${stop.duration} visit` : ""}
        </small>
        <div className={styles.routeStopActions}>
          <button
            type="button"
            disabled={isEditing}
            onClick={() => onStartReplacement(stop.attractionId)}
          >
            Replace
          </button>
          <button
            type="button"
            disabled={isEditing}
            onClick={() => onRemove(stop.attractionId)}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export default function RouteStops({
  draft,
  activePoiId,
  hoveredPoiId,
  replacementTargetId,
  isEditing,
  onPoiHover,
  onPoiSelect,
  onRemove,
  onStartReplacement,
}: RouteStopsProps) {
  const emphasizedId = hoveredPoiId ?? activePoiId;
  const cardRefs = useRef(new Map<number, HTMLLIElement>());

  useEffect(() => {
    if (activePoiId === null) return;
    cardRefs.current.get(activePoiId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activePoiId]);

  return (
    <section className={styles.routeEditor} aria-labelledby="your-route-heading">
      <h3 id="your-route-heading">Your route</h3>
      <ol>
        <li className={styles.endpointStop}>
          <span className={`${styles.routeNode} ${styles.originNode}`}>A</span>
          <div><strong>{draft.origin.label}</strong><small>Origin</small></div>
        </li>
        {draft.stops.map((stop, index) =>
          stop.source === "user" ? (
            <li className={styles.userStop} key={`user-${index}-${stop.label}`}>
              <span className={`${styles.routeNode} ${styles.userStopNode}`}>•</span>
              <div><strong>{stop.label}</strong><small>User stop</small></div>
            </li>
          ) : (
            <AttractionStop
              key={`${stop.source}-${stop.attractionId}`}
              stop={stop}
              isActive={emphasizedId === stop.attractionId}
              isReplacing={replacementTargetId === stop.attractionId}
              isEditing={isEditing}
              onPoiHover={onPoiHover}
              onPoiSelect={onPoiSelect}
              onRemove={onRemove}
              onStartReplacement={onStartReplacement}
              cardRef={(element) => {
                if (element) cardRefs.current.set(stop.attractionId, element);
                else cardRefs.current.delete(stop.attractionId);
              }}
            />
          )
        )}
        <li className={styles.endpointStop}>
          <span className={`${styles.routeNode} ${styles.destinationNode}`}>B</span>
          <div><strong>{draft.destination.label}</strong><small>Destination</small></div>
        </li>
      </ol>
    </section>
  );
}
