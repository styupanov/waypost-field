"use client";

import { useEffect, useRef, useState } from "react";
import AreaIntelligenceSummary from "@/components/map/AreaIntelligenceSummary";
import { INTEREST_CATEGORIES } from "@/lib/interests/taxonomy";
import type { AreaIntelligenceClientState } from "@/types/exploration-intelligence";
import type { ExploreIntent } from "@/types/explore-intent";
import type { ExploreIdeasResponse, ExploreTripIdea } from "@/types/explore-planning";
import type { DrivingPace, InterestCategory } from "@/types/preferences";
import type { Coordinates, TripEndpoint } from "@/types/trip";
import styles from "./TripIntentPanel.module.css";

type Props = {
  intent: ExploreIntent; origin: TripEndpoint; areaIntelligence: AreaIntelligenceClientState;
  pickingOrigin: boolean; onOriginInput: (value: string) => void; onPickOrigin: () => void;
  onOriginResolved: (coordinates: Coordinates, label: string) => void; onClear: () => void;
  onBuildIdea: (idea: ExploreTripIdea, origin: TripEndpoint, days: number, pace: DrivingPace, interests: InterestCategory[]) => void;
};

async function resolvedOrigin(endpoint: TripEndpoint, signal: AbortSignal) {
  if (endpoint.coordinates) return { coordinates: endpoint.coordinates, label: endpoint.resolvedLabel ?? endpoint.input };
  const response = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: endpoint.input.trim() }), signal });
  if (!response.ok) throw new Error("Unable to geocode the origin.");
  const data = await response.json() as { results: { lat: number; lon: number; label: string }[] };
  if (!data.results[0]) throw new Error("No location was found for the origin.");
  return { coordinates: { lat: data.results[0].lat, lon: data.results[0].lon }, label: data.results[0].label };
}

function duration(seconds: number) { const hours = Math.floor(seconds / 3600); const minutes = Math.round((seconds % 3600) / 60); return `${hours ? `${hours} hr ` : ""}${minutes} min`; }
function distance(meters: number) { return `${Math.round(meters / 1609.344).toLocaleString()} mi`; }

export default function ExplorePlanningPanel(props: Props) {
  const [days, setDays] = useState<1 | 2 | 3>(2);
  const [pace, setPace] = useState<DrivingPace>("balanced");
  const [interests, setInterests] = useState<InterestCategory[]>([]);
  const [ideas, setIdeas] = useState<ExploreTripIdea[]>([]);
  const [outcome, setOutcome] = useState<ExploreIdeasResponse["outcome"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const profileInitialized = useRef(false);
  const interestsTouched = useRef(false);

  useEffect(() => {
    if (profileInitialized.current) return;
    profileInitialized.current = true;
    const controller = new AbortController();
    void fetch("/api/me/interests", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { selectedCategories: InterestCategory[] };
      if (!interestsTouched.current) setInterests(data.selectedCategories);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  function invalidate() { abortRef.current?.abort(); sequence.current += 1; setLoading(false); setIdeas([]); setOutcome(null); setError(null); }
  async function findIdeas() {
    if (!props.origin.input.trim()) { setError("Enter or select an origin."); return; }
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    const requestSequence = ++sequence.current; setLoading(true); setIdeas([]); setOutcome(null); setError(null);
    try {
      const resolved = await resolvedOrigin(props.origin, controller.signal);
      props.onOriginResolved(resolved.coordinates, resolved.label);
      const response = await fetch("/api/explore/ideas", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ area: { h3Index: props.intent.h3Index, resolution: props.intent.resolution }, origin: { latitude: resolved.coordinates.lat, longitude: resolved.coordinates.lon, label: resolved.label }, availableDays: days, drivingPace: pace, interests }),
      });
      if (!response.ok) throw new Error("Unable to find trip ideas right now.");
      const data = await response.json() as ExploreIdeasResponse;
      if (requestSequence !== sequence.current) return;
      setIdeas(data.ideas); setOutcome(data.outcome);
    } catch (reason) {
      if (controller.signal.aborted || requestSequence !== sequence.current) return;
      setError(reason instanceof Error ? reason.message : "Unable to find trip ideas right now.");
    } finally { if (requestSequence === sequence.current) setLoading(false); }
  }

  return <section className={styles.panel} aria-label="Explore planning">
    <div className={styles.exploreContext}><strong>Explore this area</strong><span>You&apos;ve selected an unexplored part of your map.</span><AreaIntelligenceSummary state={props.areaIntelligence} /><button type="button" onClick={props.onClear}>Clear area</button></div>
    <div className={styles.exploreForm}>
      <label className={styles.placeField}>Origin<input value={props.origin.input} disabled={loading} onChange={(event) => { invalidate(); props.onOriginInput(event.target.value); }} /></label>
      <button className={styles.pickButton} type="button" disabled={loading} aria-pressed={props.pickingOrigin} onClick={() => { invalidate(); props.onPickOrigin(); }}>{props.pickingOrigin ? "Click map for start" : "Pick start on map"}</button>
      <fieldset><legend>Available time</legend><div className={styles.choiceGrid}>{([1,2,3] as const).map((value) => <label key={value}><input type="radio" checked={days === value} onChange={() => { invalidate(); setDays(value); }} />{value} {value === 1 ? "day" : "days"}</label>)}</div></fieldset>
      <fieldset><legend>Driving pace</legend><div className={styles.choiceGrid}>{([{key:"easy",label:"6 hours/day"},{key:"balanced",label:"8 hours/day"},{key:"road_trip",label:"10 hours/day"}] as const).map(({key,label}) => <label key={key}><input type="radio" checked={pace === key} onChange={() => { invalidate(); setPace(key); }} />{label}</label>)}</div><small>Used only as a maximum driving budget.</small></fieldset>
      <fieldset><legend>Trip interests</legend><div className={styles.choiceGrid}>{INTEREST_CATEGORIES.map(({key,label}) => <label key={key}><input type="checkbox" checked={interests.includes(key)} onChange={() => { interestsTouched.current = true; invalidate(); setInterests((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current,key]); }} />{label}</label>)}</div></fieldset>
      <button type="button" disabled={loading || props.pickingOrigin} onClick={() => void findIdeas()}>{loading ? "Finding trip ideas…" : "Find trip ideas"}</button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {outcome === "no_matching_attractions" ? <p className={styles.exploreNotice}>No places matching these interests were found in this area.</p> : null}
      {outcome === "outside_driving_budget" ? <p className={styles.exploreNotice}>No matching places fit this driving budget.</p> : null}
      {outcome === "routing_failed" ? <p className={styles.exploreNotice}>Routes to places in this area could not be calculated. Please try again.</p> : null}
      {ideas.length ? <div className={styles.ideaList} aria-label="Trip ideas">{ideas.map((idea) => <article key={idea.id} className={styles.ideaCard}><h2>{idea.destination.name}</h2><p>{idea.destination.categoryLabel}</p><p>{duration(idea.route.durationSeconds)} · {distance(idea.route.distanceMeters)}</p><p>Round-trip drive</p><p>{idea.destination.rating.toFixed(1)} · {idea.destination.reviewCount.toLocaleString()} reviews</p><button type="button" onClick={() => props.onBuildIdea(idea, { input: props.origin.input, coordinates: props.origin.coordinates, resolvedLabel: props.origin.resolvedLabel, source: props.origin.source }, days, pace, interests)}>Build this trip</button></article>)}</div> : null}
    </div>
  </section>;
}
