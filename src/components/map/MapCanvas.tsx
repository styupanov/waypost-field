"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export default function MapCanvas() {
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

    mapInstance.on("load", async () => {
      try {
        const response = await fetch("/api/route", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            locations: [
              {
                lat: 35.2271,
                lon: -80.8431,
              },
              {
                lat: 39.7392,
                lon: -104.9903,
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();

          console.error("Route API response:", errorText);

          throw new Error(
            `Failed to fetch route. Status: ${response.status}`
          );
        }

        const data = await response.json();

        mapInstance.addSource("route", {
          type: "geojson",
          data: data.route,
        });

        mapInstance.addLayer({
          id: "route-line",
          type: "line",
          source: "route",

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

        const coordinates = data.route.geometry.coordinates as [
          number,
          number
        ][];

        const bounds = new maplibregl.LngLatBounds();

        for (const coordinate of coordinates) {
          bounds.extend(coordinate);
        }

        mapInstance.fitBounds(bounds, {
          padding: 80,
          duration: 1200,
        });
      } catch (error) {
        console.error("Failed to load route:", error);
      }
    });

    return () => {
      mapInstance.remove();
      map.current = null;
    };
  }, []);

  return <div ref={mapContainer} className="map-canvas" />;
}
