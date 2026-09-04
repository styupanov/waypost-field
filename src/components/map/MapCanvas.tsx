"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RouteFeature } from "@/types/route";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type MapCanvasProps = {
  route: RouteFeature | null;
};

const ROUTE_SOURCE_ID = "route";
const ROUTE_LAYER_ID = "route-line";

function renderRoute(map: maplibregl.Map, route: RouteFeature) {
  const routeSource = map.getSource(ROUTE_SOURCE_ID);

  if (routeSource) {
    (routeSource as maplibregl.GeoJSONSource).setData(route);
  } else {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: route,
    });
  }

  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#1f2937",
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });
  }

  const bounds = new maplibregl.LngLatBounds();

  for (const coordinate of route.geometry.coordinates) {
    bounds.extend(coordinate);
  }

  map.fitBounds(bounds, {
    padding: 80,
    duration: 1200,
  });
}

export default function MapCanvas({ route }: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) {
      return;
    }

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-98.5, 39.5],
      zoom: 3.5,
    });

    map.current = mapInstance;

    mapInstance.on("error", (event) => {
      console.error("MapLibre error:", event.error);
    });

    mapInstance.addControl(
      new maplibregl.NavigationControl(),
      "bottom-right"
    );

    return () => {
      mapInstance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const mapInstance = map.current;

    if (!mapInstance || !route) {
      return;
    }

    if (mapInstance.isStyleLoaded()) {
      renderRoute(mapInstance, route);
      return;
    }

    const handleLoad = () => renderRoute(mapInstance, route);
    mapInstance.once("load", handleLoad);

    return () => {
      mapInstance.off("load", handleLoad);
    };
  }, [route]);

  return <div ref={mapContainer} className="map-canvas" />;
}
