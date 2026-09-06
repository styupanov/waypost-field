"use client";

import { useEffect, useRef, useState } from "react";
import type { AreaIntelligenceClientState } from "../../types/exploration-intelligence.ts";

export function useAreaExplorationIntelligence(area: { h3Index: string; resolution: number } | null) {
  const h3Index = area?.h3Index ?? null;
  const resolution = area?.resolution ?? null;
  const areaKey = h3Index && resolution !== null ? `${resolution}:${h3Index}` : null;
  const [result, setResult] = useState<{ key: string; state: AreaIntelligenceClientState } | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const requestSequence = ++sequence.current;
    if (!areaKey || !h3Index || resolution === null) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ h3: h3Index, resolution: String(resolution) });
    void fetch(`/api/map/exploration/area?${params}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("area intelligence"); return response.json(); })
      .then((data) => { if (sequence.current === requestSequence) setResult({ key: areaKey, state: { status: "ready", data } }); })
      .catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError") && sequence.current === requestSequence) setResult({ key: areaKey, state: { status: "error", data: null } }); });
    return () => controller.abort();
  }, [areaKey, h3Index, resolution]);
  if (!areaKey) return { status: "idle", data: null } as const;
  return result?.key === areaKey ? result.state : { status: "loading", data: null } as const;
}
