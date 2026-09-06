"use client";

import { useEffect, useState } from "react";
import { attractionEnrichmentPath } from "@/lib/attraction-enrichment/client";
import type { AttractionEnrichmentResponse } from "@/types/attraction-enrichment";
import styles from "./TripIntentPanel.module.css";

function sourceLabel(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("google.") || host === "maps.google.com" ? "Google Maps" : "Official website";
  } catch { return null; }
}

function practicalContext(value: string | null, hasOfficialWebsite: boolean) {
  if (!value) return null;
  const sentences = value.split(/(?<=[.!?])\s+/).filter((sentence) => !(hasOfficialWebsite && /official website|additional details|more information/i.test(sentence)));
  return sentences.join(" ").trim() || null;
}

function compactDescription(value: string) {
  return value.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
}

export default function AttractionEnrichmentCard({ attractionId }: { attractionId: number }) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "empty"; data: AttractionEnrichmentResponse["enrichment"] }>({ status: "loading", data: null });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(attractionEnrichmentPath(attractionId), { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<AttractionEnrichmentResponse> : { enrichment: null })
      .then(({ enrichment }) => setState({ status: enrichment ? "ready" : "empty", data: enrichment }))
      .catch(() => { if (!controller.signal.aborted) setState({ status: "empty", data: null }); });
    return () => controller.abort();
  }, [attractionId]);
  if (state.status === "loading") return <small className={styles.enrichmentLoading}>Loading overview…</small>;
  if (!state.data) return <small className={styles.enrichmentUnavailable}>Overview unavailable.</small>;
  const links = state.data.sourceUrls.flatMap((url) => { const label = sourceLabel(url); return label ? [{ url, label }] : []; }).filter((item, index, items) => items.findIndex((candidate) => candidate.label === item.label) === index);
  const note = practicalContext(state.data.practicalNote, links.some((link) => link.label === "Official website"));
  return <div className={styles.enrichmentCard}>
    <p className={styles.enrichmentDescription}>{compactDescription(state.data.shortDescription)}</p>
    <section><strong className={styles.enrichmentLabel}>Why stop here</strong><p>{state.data.whyVisit}</p></section>
    <section><strong className={styles.enrichmentLabel}>Highlights</strong><ul className={styles.enrichmentHighlights}>{state.data.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul></section>
    {note ? <p className={styles.enrichmentPractical}><span aria-hidden="true">📍</span>{note}</p> : null}
    {links.length ? <nav className={styles.enrichmentLinks} aria-label="Attraction sources">{links.map(({ url, label }) => <a href={url} key={label} target="_blank" rel="noopener noreferrer">{label}</a>)}</nav> : null}
    <small className={styles.enrichmentAttribution}>AI-generated overview</small>
  </div>;
}
