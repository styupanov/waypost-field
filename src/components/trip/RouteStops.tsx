"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./TripIntentPanel.module.css";
import { isAttractionStop, isOvernightStop, type Coordinates, type DraftAttractionStop, type DraftDayBoundary, type DraftOvernightStop, type DraftStop, type TripDraft } from "@/types/trip";

type Props = {
  draft: TripDraft; activePoiId: number | null; activeNightIndex: number | null;
  hoveredPoiId: number | null; replacementTargetId: number | null; isEditing: boolean;
  readOnly: boolean;
  onPoiHover: (id: number | null) => void; onPoiSelect: (id: number) => void;
  onOvernightSelect: (night: number) => void; onDayFocus: (points: Coordinates[]) => void;
  onRemove: (id: number) => void; onStartReplacement: (id: number) => void;
  onLoadOvernightAlternatives: (night: number) => Promise<void>;
  onChangeOvernight: (night: number, id: number) => Promise<void>;
};

function Attraction({ stop, active, replacing, props, cardRef }: { stop: DraftAttractionStop; active: boolean; replacing: boolean; props: Props; cardRef: (node: HTMLLIElement | null) => void }) {
  return <li className={`${styles.routeStop} ${active ? styles.poiActive : ""} ${replacing ? styles.replacementTarget : ""}`} ref={cardRef} onMouseEnter={() => props.onPoiHover(stop.attractionId)} onMouseLeave={() => props.onPoiHover(null)}>
    <span className={`${styles.routeNode} ${stop.source === "waypost" ? styles.waypostNode : styles.userAttractionNode}`} aria-hidden="true" />
    <div className={styles.routeStopContent}>
      <button className={styles.poiNameButton} type="button" onClick={() => props.onPoiSelect(stop.attractionId)}>{stop.label}</button>
      <small>{stop.source === "waypost" ? "Waypost suggestion" : "Added by you"}{stop.duration ? ` · ${stop.duration} visit` : ""}</small>
      {!props.readOnly ? <div className={styles.routeStopActions}>
        <button type="button" disabled={props.isEditing} onClick={() => props.onStartReplacement(stop.attractionId)}>Replace</button>
        <button type="button" disabled={props.isEditing} onClick={() => props.onRemove(stop.attractionId)}>Remove</button>
      </div> : null}
    </div>
  </li>;
}

function Overnight({ stop, active, changing, props, toggle }: { stop: DraftOvernightStop; active: boolean; changing: boolean; props: Props; toggle: () => void }) {
  const alternatives = props.draft.overnightAlternatives.find((night) => night.nightIndex === stop.nightIndex)?.candidates ?? [];
  return <li className={`${styles.overnightStop} ${active ? styles.overnightActive : ""}`}>
    <span className={`${styles.routeNode} ${styles.overnightNode}`} aria-hidden="true">☾</span>
    <div className={styles.routeStopContent}>
      <button type="button" className={styles.poiNameButton} onClick={() => props.onOvernightSelect(stop.nightIndex)}>{stop.label}{stop.admin1Code ? `, ${stop.admin1Code}` : ""} area</button>
      <small>Night {stop.nightIndex} · Approximate overnight area</small>
      {!props.readOnly ? <div className={styles.routeStopActions}><button type="button" disabled={props.isEditing} aria-expanded={changing} onClick={async () => { if (!changing) await props.onLoadOvernightAlternatives(stop.nightIndex); toggle(); }}>{changing ? "Cancel" : "Change"}</button></div> : null}
      {changing && !props.readOnly ? <ul className={styles.overnightChoices}>{alternatives.filter((item) => item.geonameId !== stop.geonameId).map((item) => <li key={item.geonameId}>
        <div><strong>{item.name}{item.admin1Code ? `, ${item.admin1Code}` : ""} area</strong><small>≈ {Math.round(item.targetTimeDeviationMinutes)} min from target · +{Math.round(item.detourDurationSeconds / 60)} min driving</small></div>
        <button type="button" disabled={props.isEditing} onClick={async () => { await props.onChangeOvernight(stop.nightIndex, item.geonameId); toggle(); }}>Choose</button>
      </li>)}</ul> : null}
    </div>
  </li>;
}

function formatDriving(seconds: number) {
  const minutes = Math.round(seconds / 60); const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m driving` : `${hours}h driving`;
}

function groupStops(draft: TripDraft) {
  const groups = new Map<number, DraftStop[]>(); let day = 1;
  for (const stop of draft.stops) {
    if (isOvernightStop(stop)) { day += 1; continue; }
    groups.set(day, [...(groups.get(day) ?? []), stop]);
  }
  return groups;
}

function currentBoundary(draft: TripDraft, boundary: DraftDayBoundary) {
  if (boundary.kind === "origin") return draft.origin;
  if (boundary.kind === "destination") return draft.destination;
  return draft.stops.find((stop): stop is DraftOvernightStop => isOvernightStop(stop) && stop.nightIndex === boundary.nightIndex) ?? boundary;
}

function focusPoints(start: { coordinates: Coordinates }, end: { coordinates: Coordinates }, stops: DraftStop[]) {
  return [start.coordinates, ...stops.map((stop) => stop.coordinates), end.coordinates];
}

function UserStop({ stop, keyValue }: { stop: DraftStop & { source: "user" }; keyValue: string }) {
  return <li className={styles.userStop} key={keyValue}><span className={`${styles.routeNode} ${styles.userStopNode}`}>•</span><div><strong>{stop.label}</strong><small>User stop</small></div></li>;
}

export default function RouteStops(props: Props) {
  const { draft } = props; const emphasized = props.hoveredPoiId ?? props.activePoiId;
  const refs = useRef(new Map<number, HTMLLIElement>());
  const groups = useMemo(() => groupStops(draft), [draft]);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set(draft.dayPlans.length >= 5 ? draft.dayPlans.slice(1).map((day) => day.dayIndex) : []));
  const [changingNight, setChangingNight] = useState<number | null>(null);
  const activeAttractionDay = props.activePoiId === null ? null : [...groups.entries()].find(([, stops]) => stops.some((item) => isAttractionStop(item) && item.attractionId === props.activePoiId))?.[0] ?? null;
  useEffect(() => { if (props.activePoiId !== null) refs.current.get(props.activePoiId)?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [props.activePoiId]);
  const attraction = (stop: DraftAttractionStop) => <Attraction key={`${stop.source}-${stop.attractionId}`} stop={stop} active={emphasized === stop.attractionId} replacing={props.replacementTargetId === stop.attractionId} props={props} cardRef={(node) => { if (node) refs.current.set(stop.attractionId, node); else refs.current.delete(stop.attractionId); }} />;

  if (!draft.multiDay.isMultiDay || !draft.dayPlans.length) {
    return <section className={styles.routeEditor} aria-labelledby="your-route-heading"><h3 id="your-route-heading">Your route</h3><ol>
      <li className={styles.endpointStop}><span className={`${styles.routeNode} ${styles.originNode}`}>A</span><div><strong>{draft.origin.label}</strong><small>Origin</small></div></li>
      {draft.stops.map((stop, index) => isOvernightStop(stop) ? null : stop.source === "user" ? <UserStop key={`user-${index}`} stop={stop} keyValue={`user-${index}`} /> : attraction(stop))}
      <li className={styles.endpointStop}><span className={`${styles.routeNode} ${styles.destinationNode}`}>B</span><div><strong>{draft.destination.label}</strong><small>Destination</small></div></li>
    </ol></section>;
  }

  return <section className={`${styles.routeEditor} ${styles.dayItinerary}`} aria-labelledby="your-route-heading"><h3 id="your-route-heading">Your route</h3>
    {draft.dayPlans.map((plan) => {
      const stops = groups.get(plan.dayIndex) ?? [];
      const overnight = draft.stops.find((stop): stop is DraftOvernightStop => isOvernightStop(stop) && stop.nightIndex === plan.dayIndex);
      const currentStart = currentBoundary(draft, plan.start);
      const currentEnd = currentBoundary(draft, plan.end);
      const isCollapsed = collapsed.has(plan.dayIndex) && activeAttractionDay !== plan.dayIndex && props.activeNightIndex !== plan.dayIndex;
      const attractionCount = stops.filter(isAttractionStop).length;
      const visits = plan.autoVisitMinutesKnown + plan.hardVisitMinutesKnown;
      const active = props.activeNightIndex === plan.dayIndex || activeAttractionDay === plan.dayIndex;
      return <section className={`${styles.daySection} ${active ? styles.dayActive : ""}`} key={plan.dayIndex}>
        <button type="button" className={styles.dayHeader} aria-expanded={!isCollapsed} onClick={() => { setCollapsed((current) => { const next = new Set(current); if (next.has(plan.dayIndex)) next.delete(plan.dayIndex); else next.add(plan.dayIndex); return next; }); props.onDayFocus(focusPoints(currentStart, currentEnd, stops)); }}>
          <span><strong>Day {plan.dayIndex}</strong><small>{currentStart.label} → {currentEnd.label}</small></span>
          <span><small>{formatDriving(plan.structuralDrivingSeconds)} · {Math.round(plan.structuralDistanceKm).toLocaleString("en-US")} km</small><small>{attractionCount === 1 ? "1 attraction" : `${attractionCount} attractions`}{visits > 0 ? ` · ~${Math.round(visits / 30) * 30} min visits` : ""}</small></span>
          <span aria-hidden="true">{isCollapsed ? "+" : "−"}</span>
        </button>
        {!isCollapsed ? <ol>
          <li className={styles.endpointStop}><span className={`${styles.routeNode} ${plan.dayIndex === 1 ? styles.originNode : styles.overnightNode}`}>{plan.dayIndex === 1 ? "A" : "☾"}</span><div><strong>{currentStart.label}</strong><small>{plan.dayIndex === 1 ? "Origin" : "Start area"}</small></div></li>
          {stops.map((stop, index) => stop.source === "user" ? <UserStop key={`user-${plan.dayIndex}-${index}`} stop={stop} keyValue={`user-${plan.dayIndex}-${index}`} /> : attraction(stop))}
          {attractionCount === 0 ? <li className={styles.emptyDay}><span aria-hidden="true">↓</span><small>No suggested stops yet</small></li> : null}
          {overnight ? <Overnight stop={overnight} active={props.activeNightIndex === overnight.nightIndex} changing={changingNight === overnight.nightIndex} props={props} toggle={() => setChangingNight((current) => current === overnight.nightIndex ? null : overnight.nightIndex)} /> : <li className={styles.endpointStop}><span className={`${styles.routeNode} ${styles.destinationNode}`}>B</span><div><strong>{draft.destination.label}</strong><small>Destination</small></div></li>}
        </ol> : null}
      </section>;
    })}
  </section>;
}
