"use client";

import { useState } from "react";
import MapCanvas from "@/components/map/MapCanvas";
import TripIntentPanel from "@/components/trip/TripIntentPanel";
import type { RouteFeature } from "@/types/route";

export default function TripPlanner() {
  const [route, setRoute] = useState<RouteFeature | null>(null);

  return (
    <>
      <MapCanvas route={route} />
      <TripIntentPanel onRouteBuilt={setRoute} />
    </>
  );
}
