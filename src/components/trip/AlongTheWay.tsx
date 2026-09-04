"use client";

import { useEffect, useRef } from "react";
import styles from "./TripIntentPanel.module.css";
import type { InterestCategory } from "@/types/preferences";
import type { TripAlternative } from "@/types/trip";

const CATEGORY_LABELS: Record<InterestCategory, string> = {
  nature_scenic: "Nature & scenic",
  outdoor_adventure: "Outdoor adventure",
  history_landmarks: "History & landmarks",
  museums_culture: "Museums & culture",
  food_drink: "Food & drink",
  shopping: "Shopping",
};

type AlongTheWayProps = {
  alternatives: TripAlternative[];
  activePoiId: number | null;
  hoveredPoiId: number | null;
  replacementTargetName: string | null;
  isEditing: boolean;
  onPoiHover: (attractionId: number | null) => void;
  onPoiSelect: (attractionId: number) => void;
  onAdd: (attractionId: number) => void;
  onReplace: (replacementAttractionId: number) => void;
  onCancelReplacement: () => void;
  isOpen: boolean;
  onToggle: () => void;
};

export default function AlongTheWay({
  alternatives,
  activePoiId,
  hoveredPoiId,
  replacementTargetName,
  isEditing,
  onPoiHover,
  onPoiSelect,
  onAdd,
  onReplace,
  onCancelReplacement,
  isOpen,
  onToggle,
}: AlongTheWayProps) {
  const cardRefs = useRef(new Map<number, HTMLLIElement>());
  const emphasizedId = hoveredPoiId ?? activePoiId;

  useEffect(() => {
    if (activePoiId === null) return;
    cardRefs.current.get(activePoiId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activePoiId]);

  if (alternatives.length === 0) return null;

  return (
    <aside className={`${styles.alongDrawer} ${isOpen ? styles.drawerOpen : ""}`} aria-labelledby="alternatives-heading">
      <button
        className={styles.drawerToggle}
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span id="alternatives-heading">
          {replacementTargetName ? "Choose a replacement" : "Along the way"}
        </span>
        <span>{alternatives.length} places</span>
        <span aria-hidden="true">{isOpen ? "▼" : "▲"}</span>
      </button>
      {isOpen ? <div className={styles.drawerContent}>
        {replacementTargetName ? (
          <p>Replacing <strong>{replacementTargetName}</strong>. Choose a place below or on the map. <button type="button" disabled={isEditing} onClick={onCancelReplacement}>Cancel</button></p>
        ) : (
          <p>Relevant places that are not currently part of your route.</p>
        )}
        <ul>
        {alternatives.map((alternative) => (
          <li
            key={alternative.attractionId}
            ref={(element) => {
              if (element) cardRefs.current.set(alternative.attractionId, element);
              else cardRefs.current.delete(alternative.attractionId);
            }}
            className={emphasizedId === alternative.attractionId ? styles.poiActive : ""}
            onMouseEnter={() => onPoiHover(alternative.attractionId)}
            onMouseLeave={() => onPoiHover(null)}
          >
            <button
              className={styles.poiNameButton}
              type="button"
              onClick={() => onPoiSelect(alternative.attractionId)}
            >
              {alternative.name}
            </button>
            <span>
              {alternative.interestCategory
                ? CATEGORY_LABELS[alternative.interestCategory]
                : alternative.rawCategory}
            </span>
            <span>
              {alternative.rating.toFixed(1)} ★ · {alternative.reviewCount.toLocaleString("en-US")} reviews
            </span>
            <span>
              +{Math.round(alternative.individualDetourDurationSeconds / 60)} min driving
              {alternative.duration ? ` · ${alternative.duration} visit` : ""}
            </span>
            <button
              type="button"
              disabled={isEditing}
              onClick={() =>
                replacementTargetName
                  ? onReplace(alternative.attractionId)
                  : onAdd(alternative.attractionId)
              }
            >
              {replacementTargetName ? "Use as replacement" : "Add"}
            </button>
          </li>
        ))}
        </ul>
      </div> : null}
    </aside>
  );
}
