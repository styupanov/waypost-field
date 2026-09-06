import type { AreaIntelligenceClientState } from "@/types/exploration-intelligence";

export default function AreaIntelligenceSummary({ state }: { state: AreaIntelligenceClientState }) {
  if (state.status === "loading") return <small role="status">Checking places in this area…</small>;
  if (state.status === "error") return <small>Area information is temporarily unavailable.</small>;
  if (state.status !== "ready") return null;
  const intelligence = state.data;
  let summary: string;
  if (intelligence.totalPlaceCount === 0) summary = "No mapped places of interest here yet.";
  else if (intelligence.mode === "personalized" && intelligence.matchedPlaceCount === 0) summary = "No places matching your interests found here yet.";
  else if (intelligence.mode === "personalized") summary = `${intelligence.matchedPlaceCount} places here match your interests`;
  else summary = `${intelligence.totalPlaceCount} places of interest in this area`;
  return <div className="area-intelligence-summary">
    <strong>{summary}</strong>
    {intelligence.categoryBreakdown.length > 0 ? <ul>{intelligence.categoryBreakdown.map((item) => <li key={item.category}><span>{item.label}</span><span>{item.count}</span></li>)}</ul> : null}
  </div>;
}
